use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs::{self, File, OpenOptions},
    io::{self, Write},
    path::{Component, Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    time::{SystemTime, UNIX_EPOCH},
};

const FILE_NAME: &str = "dynasty.json";
/// Pictures of a dynasty: `<dynasty>/photos/<sha256>.<jpg|png|webp>`, named by their content.
const PHOTO_FOLDER: &str = "photos";
const MAX_PHOTO_SIZE: u64 = 64 * 1024 * 1024;
/// A copy of dynasty.json from before its photos moved out.
const BACKUP_NAME: &str = "dynasty.backup-before-photos";
/// An unreadable dynasty.json, kept when a saved version replaces it.
const DAMAGED_NAME: &str = "dynasty.damaged";
/// Recent copies of dynasty.json: `<dynasty>/backups/dynasty-YYYYMMDD-HHMMSS-mmm.json`.
const VERSION_FOLDER: &str = "backups";
/// Marks a dynasty as open in one copy of the program; the same format as dynastyProtection.ts.
const OPEN_MARKER: &str = ".talebranch-open.json";
/// A marker this old was left by a crash.
const MARKER_STALE_MS: u64 = 3 * 60 * 1000;

#[derive(Debug, Serialize)]
pub struct StorageError {
    pub name: String,
    pub message: String,
}
impl From<io::Error> for StorageError {
    fn from(error: io::Error) -> Self {
        let name = match error.kind() {
            io::ErrorKind::NotFound => "NotFoundError",
            io::ErrorKind::PermissionDenied => "NotAllowedError",
            io::ErrorKind::AlreadyExists => "InvalidModificationError",
            _ => "Error",
        };
        Self {
            name: name.into(),
            message: error.to_string(),
        }
    }
}
fn failure(message: &str) -> StorageError {
    StorageError {
        name: "Error".into(),
        message: message.into(),
    }
}
pub type Result<T> = std::result::Result<T, StorageError>;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Directory {
    pub path: String,
    pub name: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Recent {
    pub id: String,
    pub name: String,
    pub directory: Directory,
}

pub struct Storage {
    roots: Mutex<HashSet<PathBuf>>,
    settings: PathBuf,
    session: PathBuf,
    settings_lock: Mutex<()>,
    /// This copy of the program in open markers.
    owner: String,
    /// Dynasties marked as open here; the markers are removed when the program exits.
    opened: Mutex<HashSet<PathBuf>>,
}
impl Storage {
    pub fn new(data: &Path) -> io::Result<Self> {
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        fs::create_dir_all(data)?;
        let number = COUNTER.fetch_add(1, Ordering::Relaxed);
        Ok(Self {
            roots: Mutex::new(HashSet::new()),
            settings: data.join("recent-folders.json"),
            session: data.join("last-folder.json"),
            settings_lock: Mutex::new(()),
            owner: format!("desktop-{}-{}-{number}", std::process::id(), now_ms()),
            opened: Mutex::new(HashSet::new()),
        })
    }
    pub fn allow(&self, path: &Path) -> Result<Directory> {
        let path = fs::canonicalize(path)?;
        if !path.is_dir() {
            return Err(failure("NOT_A_DIRECTORY"));
        }
        self.roots.lock().unwrap().insert(path.clone());
        Ok(describe(&path))
    }
    fn directory(&self, path: &str) -> Result<PathBuf> {
        let canonical = fs::canonicalize(path)?;
        if !canonical.is_dir()
            || !self
                .roots
                .lock()
                .unwrap()
                .iter()
                .any(|root| canonical.starts_with(root))
        {
            return Err(failure("DIRECTORY_NOT_SELECTED"));
        }
        Ok(canonical)
    }
    fn file(&self, directory: &str) -> Result<PathBuf> {
        inside(&self.directory(directory)?, FILE_NAME, "INVALID_DYNASTY_FILE")
    }
    /// `<dynasty>/<name>` as a real folder directly inside the dynasty; `None` when it does not exist yet.
    fn subfolder(&self, directory: &str, name: &str, create: bool, invalid: &str) -> Result<Option<PathBuf>> {
        let directory = self.directory(directory)?;
        let folder = directory.join(name);
        match fs::symlink_metadata(&folder) {
            Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
                return Err(failure(invalid));
            }
            Ok(_) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound && create => fs::create_dir(&folder)?,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error.into()),
        }
        let canonical = fs::canonicalize(&folder)?;
        if canonical.parent() != Some(directory.as_path()) {
            return Err(failure(invalid));
        }
        Ok(Some(canonical))
    }
    fn photo_folder(&self, directory: &str, create: bool) -> Result<Option<PathBuf>> {
        self.subfolder(directory, PHOTO_FOLDER, create, "INVALID_PHOTO_FOLDER")
    }
    fn version_folder(&self, directory: &str, create: bool) -> Result<Option<PathBuf>> {
        self.subfolder(directory, VERSION_FOLDER, create, "INVALID_VERSION_FOLDER")
    }
    /// Only our own file names directly inside the photos folder: no `..`, other folders or links.
    fn photo(&self, folder: &Path, name: &str) -> Result<PathBuf> {
        if !photo_name(name) {
            return Err(failure("INVALID_PHOTO_NAME"));
        }
        inside(folder, name, "INVALID_PHOTO_FILE")
    }
    /// Only version names directly inside the backups folder.
    fn version(&self, folder: &Path, name: &str) -> Result<PathBuf> {
        if !version_name(name) {
            return Err(failure("INVALID_VERSION_NAME"));
        }
        inside(folder, name, "INVALID_VERSION_FILE")
    }
    /// Marks the dynasty as open in this copy of the program; refreshing is claiming again.
    fn claim(&self, directory: &str) -> Result<()> {
        let path = self.directory(directory)?;
        let _lock = lock_directory(&path)?;
        let marker = inside(&path, OPEN_MARKER, "INVALID_OPEN_MARKER")?;
        if let Some((owner, updated)) = read_marker(&marker)? {
            if owner != self.owner && now_ms().saturating_sub(updated) < MARKER_STALE_MS {
                return Err(failure("DYNASTY_OPEN_ELSEWHERE"));
            }
        }
        let contents = json!({
            "app": "talebranch",
            "owner": self.owner,
            "session": self.owner,
            "updatedAt": now_ms()
        });
        atomic_write(&marker, contents.to_string().as_bytes())?;
        self.opened.lock().unwrap().insert(path);
        Ok(())
    }
    fn release(&self, directory: &str) -> Result<()> {
        let path = self.directory(directory)?;
        self.opened.lock().unwrap().remove(&path);
        release_marker(&path, &self.owner)
    }
    /// Removes the markers of every dynasty still open here; called when the program exits.
    pub fn release_all(&self) {
        for path in self.opened.lock().unwrap().drain() {
            let _ = release_marker(&path, &self.owner);
        }
    }
    pub fn execute(&self, request: Request) -> Result<Value> {
        match request {
            Request::List { directory } => {
                let entries = fs::read_dir(self.directory(&directory)?)?
                    .map(|entry| entry.map(|entry| json!({ "name": entry.file_name().to_string_lossy() })))
                    .collect::<io::Result<Vec<_>>>()?;
                Ok(json!(entries))
            }
            Request::Child {
                directory,
                name,
                create,
            } => {
                valid_name(&name)?;
                let parent = self.directory(&directory)?;
                let child = parent.join(name);
                if create && !child.exists() {
                    fs::create_dir(&child)?;
                }
                let canonical = fs::canonicalize(&child)?;
                if !canonical.starts_with(&parent) || !canonical.is_dir() {
                    return Err(failure("INVALID_DIRECTORY"));
                }
                Ok(json!(describe(&canonical)))
            }
            Request::File { directory, create } => {
                let path = self.file(&directory)?;
                if create && !path.exists() {
                    OpenOptions::new().write(true).create_new(true).open(&path)?;
                }
                fs::metadata(path)?;
                Ok(Value::Null)
            }
            Request::Read { directory } => {
                let text = read_text(&self.file(&directory)?)?;
                Ok(json!({ "revision": hash(&text), "text": text }))
            }
            Request::Write {
                directory,
                text,
                expected,
            } => {
                // A file lock also coordinates independent portable processes.
                let directory_path = self.directory(&directory)?;
                let _lock = lock_directory(&directory_path)?;
                let path = self.file(&directory)?;
                let previous = read_text(&path)?;
                if hash(&previous) != expected {
                    return Err(failure("FOLDER_CONFLICT"));
                }
                validate_document(&text)?;
                atomic_write(&path, text.as_bytes())?;
                Ok(Value::Null)
            }
            Request::Remove { directory, name } => {
                valid_name(&name)?;
                let parent = self.directory(&directory)?;
                let path = parent.join(&name);
                let metadata = fs::symlink_metadata(&path)?;
                if metadata.file_type().is_symlink() {
                    return Err(failure("INVALID_DIRECTORY"));
                }
                if metadata.is_dir() {
                    if !fs::canonicalize(&path)?.starts_with(&parent) {
                        return Err(failure("INVALID_DIRECTORY"));
                    }
                    fs::remove_dir(path)?; // Nonrecursive: other files are never deleted.
                } else if name == FILE_NAME {
                    let _lock = lock_directory(&parent)?;
                    fs::remove_file(self.file(&directory)?)?;
                } else {
                    return Err(failure("UNMANAGED_FILE"));
                }
                Ok(Value::Null)
            }
            Request::PhotoList { directory } => {
                let Some(folder) = self.photo_folder(&directory, false)? else {
                    return Ok(json!([]));
                };
                let mut names = vec![];
                for entry in fs::read_dir(folder)? {
                    let entry = entry?;
                    let name = entry.file_name().to_string_lossy().into_owned();
                    if photo_name(&name) && entry.file_type()?.is_file() {
                        names.push(name);
                    }
                }
                Ok(json!(names))
            }
            Request::PhotoRead { directory, name } => {
                if !photo_name(&name) {
                    return Err(failure("INVALID_PHOTO_NAME"));
                }
                let Some(folder) = self.photo_folder(&directory, false)? else {
                    return Ok(Value::Null);
                };
                let path = self.photo(&folder, &name)?;
                let metadata = match fs::metadata(&path) {
                    Ok(metadata) => metadata,
                    Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Value::Null),
                    Err(error) => return Err(error.into()),
                };
                if metadata.len() > MAX_PHOTO_SIZE {
                    return Err(failure("PHOTO_TOO_LARGE"));
                }
                Ok(json!(STANDARD.encode(fs::read(path)?)))
            }
            Request::PhotoWrite {
                directory,
                name,
                base64,
            } => {
                if !photo_name(&name) {
                    return Err(failure("INVALID_PHOTO_NAME"));
                }
                let bytes = STANDARD.decode(base64).map_err(|_| failure("INVALID_PHOTO_DATA"))?;
                // The name is the content's hash, so a file can never be replaced by a different picture.
                let content = format!("{:x}.", Sha256::digest(&bytes));
                if bytes.len() as u64 > MAX_PHOTO_SIZE || !name.starts_with(&content) {
                    return Err(failure("INVALID_PHOTO_DATA"));
                }
                let folder = self
                    .photo_folder(&directory, true)?
                    .ok_or_else(|| failure("INVALID_PHOTO_FOLDER"))?;
                let path = self.photo(&folder, &name)?;
                if !path.exists() {
                    atomic_write(&path, &bytes)?;
                }
                Ok(Value::Null)
            }
            Request::PhotoRemove { directory, name } => {
                if !photo_name(&name) {
                    return Err(failure("INVALID_PHOTO_NAME"));
                }
                let Some(folder) = self.photo_folder(&directory, false)? else {
                    return Ok(Value::Null);
                };
                match fs::remove_file(self.photo(&folder, &name)?) {
                    Err(error) if error.kind() != io::ErrorKind::NotFound => Err(error.into()),
                    _ => Ok(Value::Null),
                }
            }
            Request::Backup {
                directory,
                expected,
                damaged,
            } => {
                // A copy of dynasty.json before its photos move out, or of an unreadable file before
                // a version replaces it. The bytes are copied exactly. An existing copy is never replaced.
                let path = self.file(&directory)?;
                let bytes = fs::read(&path)?;
                if hash(&String::from_utf8_lossy(&bytes)) != expected {
                    return Err(failure("FOLDER_CONFLICT"));
                }
                let base = if damaged { DAMAGED_NAME } else { BACKUP_NAME };
                let parent = self.directory(&directory)?;
                let mut number = 1;
                loop {
                    let name = match number {
                        1 => format!("{base}.json"),
                        _ => format!("{base} ({number}).json"),
                    };
                    number += 1;
                    let backup = parent.join(&name);
                    match fs::symlink_metadata(&backup) {
                        Ok(metadata) if metadata.is_file() && fs::read(&backup)? == bytes => {
                            return Ok(json!(name));
                        }
                        Ok(_) => continue,
                        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
                        Err(error) => return Err(error.into()),
                    }
                    let mut file = OpenOptions::new().write(true).create_new(true).open(&backup)?;
                    file.write_all(&bytes)?;
                    file.sync_all()?;
                    return Ok(json!(name));
                }
            }
            Request::VersionList { directory } => {
                let Some(folder) = self.version_folder(&directory, false)? else {
                    return Ok(json!([]));
                };
                let mut names = vec![];
                for entry in fs::read_dir(folder)? {
                    let entry = entry?;
                    let name = entry.file_name().to_string_lossy().into_owned();
                    if version_name(&name) && entry.file_type()?.is_file() {
                        names.push(name);
                    }
                }
                Ok(json!(names))
            }
            Request::VersionRead { directory, name } => {
                if !version_name(&name) {
                    return Err(failure("INVALID_VERSION_NAME"));
                }
                let Some(folder) = self.version_folder(&directory, false)? else {
                    return Ok(Value::Null);
                };
                match read_text(&self.version(&folder, &name)?) {
                    Ok(text) => Ok(json!(text)),
                    Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(Value::Null),
                    Err(error) => Err(error.into()),
                }
            }
            Request::VersionWrite {
                directory,
                name,
                contents,
            } => {
                if !version_name(&name) {
                    return Err(failure("INVALID_VERSION_NAME"));
                }
                // Only documents the program can open again are kept as versions.
                validate_document(&contents)?;
                let folder = self
                    .version_folder(&directory, true)?
                    .ok_or_else(|| failure("INVALID_VERSION_FOLDER"))?;
                atomic_write(&self.version(&folder, &name)?, contents.as_bytes())?;
                Ok(Value::Null)
            }
            Request::VersionRemove { directory, name } => {
                if !version_name(&name) {
                    return Err(failure("INVALID_VERSION_NAME"));
                }
                let Some(folder) = self.version_folder(&directory, false)? else {
                    return Ok(Value::Null);
                };
                match fs::remove_file(self.version(&folder, &name)?) {
                    Err(error) if error.kind() != io::ErrorKind::NotFound => Err(error.into()),
                    _ => Ok(Value::Null),
                }
            }
            Request::OpenClaim { directory } => {
                self.claim(&directory)?;
                Ok(Value::Null)
            }
            Request::OpenRelease { directory } => {
                self.release(&directory)?;
                Ok(Value::Null)
            }
            Request::DeleteDynasty { directory, expected } => {
                let path = self.directory(&directory)?;
                // Resolve and check the exact dynasty before recursive deletion.
                // Never allow a drive root or the app's own settings container.
                let settings = fs::canonicalize(self.settings.parent().unwrap())?;
                if path.parent().is_none() || path.file_name().is_none() || settings.starts_with(&path) {
                    return Err(failure("INVALID_DYNASTY_DIRECTORY"));
                }
                let _lock = lock_directory(&path)?;
                let text = read_text(&self.file(&directory)?)?;
                if hash(&text) != expected {
                    return Err(failure("FOLDER_CONFLICT"));
                }
                validate_document(&text)?;
                fs::remove_dir_all(&path)?;
                Ok(Value::Null)
            }
        }
    }
    pub fn recent(&self) -> Result<Vec<Recent>> {
        let _lock = self.settings_lock.lock().unwrap();
        let entries = self.read_recent()?;
        for entry in &entries {
            let _ = self.allow(Path::new(&entry.directory.path));
        }
        Ok(entries)
    }
    fn read_recent(&self) -> Result<Vec<Recent>> {
        match fs::read(&self.settings) {
            Ok(bytes) => serde_json::from_slice(&bytes).map_err(|error| failure(&error.to_string())),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(vec![]),
            Err(error) => Err(error.into()),
        }
    }
    pub fn remember(&self, directory: &str, name: String) -> Result<()> {
        let path = self.directory(directory)?;
        let info = describe(&path);
        let _lock = self.settings_lock.lock().unwrap();
        let mut entries = self.read_recent()?;
        entries.retain(|entry| entry.directory.path != info.path);
        let active = Recent {
            id: hash(&info.path),
            name,
            directory: info,
        };
        entries.insert(0, active.clone());
        atomic_write(
            &self.settings,
            &serde_json::to_vec_pretty(&entries).map_err(|error| failure(&error.to_string()))?,
        )?;
        atomic_write(
            &self.session,
            &serde_json::to_vec_pretty(&active).map_err(|error| failure(&error.to_string()))?,
        )?;
        Ok(())
    }
    pub fn last_folder(&self) -> Result<Option<Recent>> {
        let _lock = self.settings_lock.lock().unwrap();
        let entry: Option<Recent> = match fs::read(&self.session) {
            Ok(bytes) => serde_json::from_slice(&bytes).map_err(|error| failure(&error.to_string()))?,
            // One-time migration from versions that only stored recents. An
            // explicit close writes null, so it never falls back to another folder.
            Err(error) if error.kind() == io::ErrorKind::NotFound => self.read_recent()?.into_iter().next(),
            Err(error) => return Err(error.into()),
        };
        if let Some(entry) = &entry {
            self.allow(Path::new(&entry.directory.path))?;
        }
        Ok(entry)
    }
    pub fn clear_last_folder(&self) -> Result<()> {
        let _lock = self.settings_lock.lock().unwrap();
        atomic_write(&self.session, b"null")?;
        Ok(())
    }
    pub fn forget(&self, directory: &str) -> Result<()> {
        // A deleted dynasty no longer has a canonical path. Removing its saved
        // bookmark must still work, without accessing any user files.
        let path = fs::canonicalize(directory).unwrap_or_else(|_| PathBuf::from(directory));
        let _lock = self.settings_lock.lock().unwrap();
        let mut entries = self.read_recent()?;
        entries.retain(|entry| Path::new(&entry.directory.path) != path);
        atomic_write(
            &self.settings,
            &serde_json::to_vec_pretty(&entries).map_err(|error| failure(&error.to_string()))?,
        )?;
        if let Ok(bytes) = fs::read(&self.session) {
            if let Ok(Some(active)) = serde_json::from_slice::<Option<Recent>>(&bytes) {
                if Path::new(&active.directory.path) == path {
                    atomic_write(&self.session, b"null")?;
                }
            }
        }
        Ok(())
    }
}

#[derive(Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
pub enum Request {
    List {
        directory: String,
    },
    Child {
        directory: String,
        name: String,
        #[serde(default)]
        create: bool,
    },
    File {
        directory: String,
        #[serde(default)]
        create: bool,
    },
    Read {
        directory: String,
    },
    Write {
        directory: String,
        text: String,
        expected: String,
    },
    Remove {
        directory: String,
        name: String,
    },
    DeleteDynasty {
        directory: String,
        expected: String,
    },
    PhotoList {
        directory: String,
    },
    PhotoRead {
        directory: String,
        name: String,
    },
    PhotoWrite {
        directory: String,
        name: String,
        base64: String,
    },
    PhotoRemove {
        directory: String,
        name: String,
    },
    Backup {
        directory: String,
        expected: String,
        #[serde(default)]
        damaged: bool,
    },
    VersionList {
        directory: String,
    },
    VersionRead {
        directory: String,
        name: String,
    },
    VersionWrite {
        directory: String,
        name: String,
        contents: String,
    },
    VersionRemove {
        directory: String,
        name: String,
    },
    OpenClaim {
        directory: String,
    },
    OpenRelease {
        directory: String,
    },
}
fn describe(path: &Path) -> Directory {
    Directory {
        path: path.to_string_lossy().into_owned(),
        name: path
            .file_name()
            .unwrap_or(path.as_os_str())
            .to_string_lossy()
            .into_owned(),
    }
}
fn valid_name(name: &str) -> Result<()> {
    if name.is_empty()
        || name.contains(['/', '\\', ':'])
        || name.chars().any(|c| c < ' ' || "<>\"|?*".contains(c))
        || name.ends_with(['.', ' '])
    {
        return Err(failure("INVALID_NAME"));
    }
    let mut components = Path::new(name).components();
    if !matches!(components.next(), Some(Component::Normal(_))) || components.next().is_some() {
        return Err(failure("INVALID_NAME"));
    }
    Ok(())
}
/// `<64 hex digits>.jpg|png|webp`, exactly as photoFiles.ts names pictures.
fn photo_name(name: &str) -> bool {
    let Some((stem, extension)) = name.split_once('.') else {
        return false;
    };
    stem.len() == 64
        && stem.bytes().all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f'))
        && matches!(extension, "jpg" | "png" | "webp")
}
/// `dynasty-<8 digits>-<6 digits>-<3 digits>.json`, exactly as dynastyProtection.ts names versions.
fn version_name(name: &str) -> bool {
    let bytes = name.as_bytes();
    let digits = |range: std::ops::Range<usize>| bytes[range].iter().all(u8::is_ascii_digit);
    name.len() == 32
        && name.starts_with("dynasty-")
        && name.ends_with(".json")
        && bytes[16] == b'-'
        && bytes[23] == b'-'
        && digits(8..16)
        && digits(17..23)
        && digits(24..27)
}
/// A file directly inside `folder`: no links, other folders or paths leading out.
fn inside(folder: &Path, name: &str, invalid: &str) -> Result<PathBuf> {
    let path = folder.join(name);
    if let Ok(metadata) = fs::symlink_metadata(&path) {
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err(failure(invalid));
        }
        if fs::canonicalize(&path)?.parent() != Some(folder) {
            return Err(failure(invalid));
        }
    }
    Ok(path)
}
/// A damaged file may not be valid UTF-8; its revision is still the hash of what was read.
fn read_text(path: &Path) -> io::Result<String> {
    Ok(String::from_utf8_lossy(&fs::read(path)?).into_owned())
}
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |time| time.as_millis() as u64)
}
/// The owner and the time of a marker; an unreadable marker counts as none.
fn read_marker(path: &Path) -> Result<Option<(String, u64)>> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    let Ok(value) = serde_json::from_slice::<Value>(&bytes) else {
        return Ok(None);
    };
    let (Some(owner), Some(updated)) = (value["owner"].as_str(), value["updatedAt"].as_u64()) else {
        return Ok(None);
    };
    Ok((value["app"] == "talebranch").then(|| (owner.into(), updated)))
}
/// Removes the marker only while it is still `owner`'s.
fn release_marker(directory: &Path, owner: &str) -> Result<()> {
    let _lock = lock_directory(directory)?;
    let marker = inside(directory, OPEN_MARKER, "INVALID_OPEN_MARKER")?;
    if !read_marker(&marker)?.is_some_and(|(current, _)| current == owner) {
        return Ok(());
    }
    match fs::remove_file(&marker) {
        Err(error) if error.kind() != io::ErrorKind::NotFound => Err(error.into()),
        _ => Ok(()),
    }
}
fn hash(text: &str) -> String {
    format!("{:x}", Sha256::digest(text.as_bytes()))
}
fn validate_document(text: &str) -> Result<()> {
    let value: Value = serde_json::from_str(text).map_err(|_| failure("INVALID_PROJECT_FORMAT"))?;
    // Version 2 refers to photo files instead of keeping the pictures inside.
    let version = value["formatVersion"].as_u64();
    if value["app"] != "dynasty-chronicles" || !matches!(version, Some(1 | 2)) || !value["project"].is_object() {
        return Err(failure("INVALID_PROJECT_FORMAT"));
    }
    Ok(())
}
fn lock_directory(directory: &Path) -> Result<File> {
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(directory.join(".talebranch.lock"))?;
    file.try_lock().map_err(|_| failure("DYNASTY_BUSY"))?;
    Ok(file)
}
pub fn atomic_write(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let parent = path.parent().ok_or_else(|| io::Error::other("No parent directory"))?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
    temporary.write_all(bytes)?;
    temporary.as_file().sync_all()?;
    temporary.persist(path).map_err(|error| error.error)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn document(name: &str) -> String {
        json!({"app":"dynasty-chronicles","formatVersion":1,"project":{"name":name}}).to_string()
    }
    #[test]
    fn native_files_round_trip_without_touching_siblings() {
        let temp = tempfile::tempdir().unwrap();
        let storage = Storage::new(&temp.path().join("settings")).unwrap();
        let root = storage.allow(temp.path()).unwrap();
        let child = storage
            .execute(Request::Child {
                directory: root.path,
                name: "Дом Вороновых".into(),
                create: true,
            })
            .unwrap();
        let path = child["path"].as_str().unwrap().to_string();
        storage
            .execute(Request::File {
                directory: path.clone(),
                create: true,
            })
            .unwrap();
        let before = storage
            .execute(Request::Read {
                directory: path.clone(),
            })
            .unwrap();
        let text = document("Дом Вороновых");
        storage
            .execute(Request::Write {
                directory: path.clone(),
                text: text.clone(),
                expected: before["revision"].as_str().unwrap().into(),
            })
            .unwrap();
        assert_eq!(fs::read_to_string(Path::new(&path).join(FILE_NAME)).unwrap(), text);
        fs::write(Path::new(&path).join("notes.txt"), "Keep").unwrap();
        storage
            .execute(Request::Remove {
                directory: path.clone(),
                name: FILE_NAME.into(),
            })
            .unwrap();
        assert_eq!(fs::read_to_string(Path::new(&path).join("notes.txt")).unwrap(), "Keep");
        assert!(storage
            .execute(Request::Remove {
                directory: path,
                name: "notes.txt".into()
            })
            .is_err());
    }
    #[test]
    fn outside_paths_and_traversal_are_rejected() {
        let temp = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        let storage = Storage::new(&temp.path().join("settings")).unwrap();
        let root = storage.allow(temp.path()).unwrap();
        assert!(storage
            .execute(Request::List {
                directory: other.path().to_string_lossy().into_owned()
            })
            .is_err());
        for name in ["..", "../escape", "C:\\outside", "a/b", "a:stream"] {
            assert!(storage
                .execute(Request::Child {
                    directory: root.path.clone(),
                    name: name.into(),
                    create: true
                })
                .is_err());
        }
    }
    #[test]
    fn conflicting_or_invalid_writes_preserve_original() {
        let temp = tempfile::tempdir().unwrap();
        let storage = Storage::new(&temp.path().join("settings")).unwrap();
        let root = storage.allow(temp.path()).unwrap();
        let original = document("Original");
        fs::write(temp.path().join(FILE_NAME), &original).unwrap();
        assert!(storage
            .execute(Request::Write {
                directory: root.path.clone(),
                text: document("Changed"),
                expected: hash("stale")
            })
            .is_err());
        assert!(storage
            .execute(Request::Write {
                directory: root.path,
                text: "{}".into(),
                expected: hash(&original)
            })
            .is_err());
        assert_eq!(fs::read_to_string(temp.path().join(FILE_NAME)).unwrap(), original);
    }
    #[test]
    fn recent_folders_survive_restart_without_copying_content() {
        let temp = tempfile::tempdir().unwrap();
        let data = temp.path().join("settings");
        let storage = Storage::new(&data).unwrap();
        let root = storage.allow(temp.path()).unwrap();
        storage.remember(&root.path, "Имя".into()).unwrap();
        let reopened = Storage::new(&data).unwrap();
        let recent = reopened.recent().unwrap();
        assert_eq!(recent.len(), 1);
        assert_eq!(recent[0].name, "Имя");
        assert!(reopened
            .execute(Request::List {
                directory: root.path.clone()
            })
            .is_ok());
        reopened.forget(&root.path).unwrap();
        assert!(reopened.recent().unwrap().is_empty());
    }
    fn photo_request(directory: &str, bytes: &[u8]) -> (String, Request) {
        let name = format!("{:x}.png", Sha256::digest(bytes));
        let request = Request::PhotoWrite {
            directory: directory.into(),
            name: name.clone(),
            base64: STANDARD.encode(bytes),
        };
        (name, request)
    }
    fn photo_list(storage: &Storage, directory: &str) -> Result<Value> {
        storage.execute(Request::PhotoList {
            directory: directory.into(),
        })
    }
    fn backup(storage: &Storage, directory: &str, expected: String) -> Result<Value> {
        storage.execute(Request::Backup {
            directory: directory.into(),
            expected,
            damaged: false,
        })
    }
    #[test]
    fn photos_round_trip_inside_the_dynasty_folder() {
        let temp = tempfile::tempdir().unwrap();
        let storage = Storage::new(&temp.path().join("settings")).unwrap();
        let root = storage.allow(temp.path()).unwrap();
        assert_eq!(photo_list(&storage, &root.path).unwrap(), json!([]));
        let (name, write) = photo_request(&root.path, b"Picture");
        storage.execute(write).unwrap();
        assert_eq!(
            fs::read(temp.path().join(PHOTO_FOLDER).join(&name)).unwrap(),
            b"Picture"
        );
        fs::write(temp.path().join(PHOTO_FOLDER).join("notes.txt"), "Keep").unwrap();
        assert_eq!(photo_list(&storage, &root.path).unwrap(), json!([name.clone()]));
        let read = storage
            .execute(Request::PhotoRead {
                directory: root.path.clone(),
                name: name.clone(),
            })
            .unwrap();
        assert_eq!(STANDARD.decode(read.as_str().unwrap()).unwrap(), b"Picture");
        storage
            .execute(Request::PhotoRemove {
                directory: root.path.clone(),
                name: name.clone(),
            })
            .unwrap();
        assert_eq!(photo_list(&storage, &root.path).unwrap(), json!([]));
        let missing = storage
            .execute(Request::PhotoRead {
                directory: root.path.clone(),
                name,
            })
            .unwrap();
        assert_eq!(missing, Value::Null);
        assert_eq!(
            fs::read_to_string(temp.path().join(PHOTO_FOLDER).join("notes.txt")).unwrap(),
            "Keep"
        );
    }
    #[test]
    fn photo_paths_outside_the_dynasty_or_foreign_files_are_rejected() {
        let temp = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        let storage = Storage::new(&temp.path().join("settings")).unwrap();
        let root = storage.allow(temp.path()).unwrap();
        let (_, outside) = photo_request(&other.path().to_string_lossy(), b"Picture");
        assert!(storage.execute(outside).is_err());
        assert!(fs::read_dir(other.path()).unwrap().next().is_none());
        let hex = format!("{:x}", Sha256::digest(b"Picture"));
        for name in [
            format!("../{hex}.png"),
            format!("..\\{hex}.png"),
            format!("sub/{hex}.png"),
            format!("{hex}.png:stream"),
            format!("{hex}.exe"),
            format!("{}.png", hex.to_uppercase()),
            "notes.txt".into(),
            FILE_NAME.into(),
            "..".into(),
        ] {
            let write = Request::PhotoWrite {
                directory: root.path.clone(),
                name: name.clone(),
                base64: STANDARD.encode(b"Picture"),
            };
            assert!(storage.execute(write).is_err(), "{name}");
            let read = Request::PhotoRead {
                directory: root.path.clone(),
                name: name.clone(),
            };
            assert!(storage.execute(read).is_err(), "{name}");
            let remove = Request::PhotoRemove {
                directory: root.path.clone(),
                name: name.clone(),
            };
            assert!(storage.execute(remove).is_err(), "{name}");
        }
        // A picture is stored only under its own content hash.
        let wrong = Request::PhotoWrite {
            directory: root.path.clone(),
            name: format!("{hex}.png"),
            base64: STANDARD.encode(b"Different"),
        };
        assert!(storage.execute(wrong).is_err());
        assert!(!temp.path().join(PHOTO_FOLDER).join(format!("{hex}.png")).exists());
        // A file named "photos" is the user's own and is not replaced by a folder.
        fs::write(temp.path().join(PHOTO_FOLDER), "Not a folder").unwrap();
        let (_, blocked) = photo_request(&root.path, b"Picture");
        assert!(storage.execute(blocked).is_err());
        assert!(photo_list(&storage, &root.path).is_err());
        assert_eq!(
            fs::read_to_string(temp.path().join(PHOTO_FOLDER)).unwrap(),
            "Not a folder"
        );
    }
    #[test]
    fn backup_before_photos_never_replaces_an_existing_copy() {
        let temp = tempfile::tempdir().unwrap();
        let storage = Storage::new(&temp.path().join("settings")).unwrap();
        let root = storage.allow(temp.path()).unwrap();
        let old = document("Old");
        fs::write(temp.path().join(FILE_NAME), &old).unwrap();
        assert!(backup(&storage, &root.path, hash("stale")).is_err());
        let first = format!("{BACKUP_NAME}.json");
        assert_eq!(backup(&storage, &root.path, hash(&old)).unwrap(), json!(first));
        assert_eq!(backup(&storage, &root.path, hash(&old)).unwrap(), json!(first));
        let newer = document("Newer");
        fs::write(temp.path().join(FILE_NAME), &newer).unwrap();
        let second = backup(&storage, &root.path, hash(&newer)).unwrap();
        assert_eq!(second, json!(format!("{BACKUP_NAME} (2).json")));
        assert_eq!(fs::read_to_string(temp.path().join(first)).unwrap(), old);
    }
    #[test]
    fn documents_with_photo_files_are_accepted() {
        let photos = json!({"app":"dynasty-chronicles","formatVersion":2,"project":{"name":"Photos"}});
        assert!(validate_document(&photos.to_string()).is_ok());
        let future = json!({"app":"dynasty-chronicles","formatVersion":3,"project":{"name":"Future"}});
        assert!(validate_document(&future.to_string()).is_err());
    }
    #[test]
    fn a_locked_dynasty_cannot_be_written_by_a_second_process() {
        let temp = tempfile::tempdir().unwrap();
        let first = lock_directory(temp.path()).unwrap();
        assert!(lock_directory(temp.path()).is_err());
        drop(first);
        assert!(lock_directory(temp.path()).is_ok());
    }
    const VERSION: &str = "dynasty-20261029-120000-000.json";
    fn version_write(storage: &Storage, directory: &str, name: &str, contents: String) -> Result<Value> {
        storage.execute(Request::VersionWrite {
            directory: directory.into(),
            name: name.into(),
            contents,
        })
    }
    fn version_read(storage: &Storage, directory: &str, name: &str) -> Result<Value> {
        storage.execute(Request::VersionRead {
            directory: directory.into(),
            name: name.into(),
        })
    }
    fn version_list(storage: &Storage, directory: &str) -> Result<Value> {
        storage.execute(Request::VersionList {
            directory: directory.into(),
        })
    }
    #[test]
    fn versions_round_trip_inside_the_backups_folder() {
        let temp = tempfile::tempdir().unwrap();
        let storage = Storage::new(&temp.path().join("settings")).unwrap();
        let root = storage.allow(temp.path()).unwrap();
        assert_eq!(version_list(&storage, &root.path).unwrap(), json!([]));
        let text = document("Saved");
        version_write(&storage, &root.path, VERSION, text.clone()).unwrap();
        let folder = temp.path().join(VERSION_FOLDER);
        assert_eq!(fs::read_to_string(folder.join(VERSION)).unwrap(), text);
        fs::write(folder.join("notes.txt"), "Keep").unwrap();
        assert_eq!(version_list(&storage, &root.path).unwrap(), json!([VERSION]));
        assert_eq!(version_read(&storage, &root.path, VERSION).unwrap(), json!(text));
        storage
            .execute(Request::VersionRemove {
                directory: root.path.clone(),
                name: VERSION.into(),
            })
            .unwrap();
        assert_eq!(version_list(&storage, &root.path).unwrap(), json!([]));
        assert_eq!(version_read(&storage, &root.path, VERSION).unwrap(), Value::Null);
        assert_eq!(fs::read_to_string(folder.join("notes.txt")).unwrap(), "Keep");
    }
    #[test]
    fn version_paths_outside_the_backups_folder_or_broken_documents_are_rejected() {
        let temp = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        let storage = Storage::new(&temp.path().join("settings")).unwrap();
        let root = storage.allow(temp.path()).unwrap();
        let away = other.path().to_string_lossy().into_owned();
        assert!(version_write(&storage, &away, VERSION, document("Outside")).is_err());
        assert!(fs::read_dir(other.path()).unwrap().next().is_none());
        for name in [
            format!("../{VERSION}"),
            format!("..\\{VERSION}"),
            format!("sub/{VERSION}"),
            format!("{VERSION}:stream"),
            "dynasty-2026102-120000-000.json".into(),
            "dynasty-20261029-120000-00a.json".into(),
            "dynasty-20261029-120000-000.exe".into(),
            FILE_NAME.into(),
            "..".into(),
        ] {
            let write = version_write(&storage, &root.path, &name, document("Bad"));
            assert!(write.is_err(), "{name}");
            assert!(version_read(&storage, &root.path, &name).is_err(), "{name}");
            let remove = Request::VersionRemove {
                directory: root.path.clone(),
                name: name.clone(),
            };
            assert!(storage.execute(remove).is_err(), "{name}");
        }
        // Only documents the program can open again are kept.
        assert!(version_write(&storage, &root.path, VERSION, "{}".into()).is_err());
        assert!(!temp.path().join(VERSION_FOLDER).join(VERSION).exists());
        // A file named "backups" belongs to the user and is not replaced by a folder.
        fs::write(temp.path().join(VERSION_FOLDER), "Not a folder").unwrap();
        let blocked = version_write(&storage, &root.path, VERSION, document("Blocked"));
        assert!(blocked.is_err());
        assert!(version_list(&storage, &root.path).is_err());
        assert_eq!(
            fs::read_to_string(temp.path().join(VERSION_FOLDER)).unwrap(),
            "Not a folder"
        );
    }
    #[test]
    fn a_damaged_file_is_copied_exactly_before_a_version_replaces_it() {
        let temp = tempfile::tempdir().unwrap();
        let storage = Storage::new(&temp.path().join("settings")).unwrap();
        let root = storage.allow(temp.path()).unwrap();
        // A file cut in the middle of a Cyrillic letter is not valid UTF-8.
        let mut damaged = br#"{"app":"dynasty-chronicles","project":{"name":""#.to_vec();
        damaged.extend_from_slice(&"Дом".as_bytes()[..3]);
        fs::write(temp.path().join(FILE_NAME), &damaged).unwrap();
        let read = storage
            .execute(Request::Read {
                directory: root.path.clone(),
            })
            .unwrap();
        let revision = read["revision"].as_str().unwrap().to_string();
        let copy = storage
            .execute(Request::Backup {
                directory: root.path.clone(),
                expected: revision.clone(),
                damaged: true,
            })
            .unwrap();
        let name = format!("{DAMAGED_NAME}.json");
        assert_eq!(copy, json!(name));
        assert_eq!(fs::read(temp.path().join(&name)).unwrap(), damaged);
        let restored = document("Restored");
        storage
            .execute(Request::Write {
                directory: root.path.clone(),
                text: restored.clone(),
                expected: revision,
            })
            .unwrap();
        assert_eq!(fs::read_to_string(temp.path().join(FILE_NAME)).unwrap(), restored);
    }
    fn claim(storage: &Storage, directory: &str) -> Result<Value> {
        storage.execute(Request::OpenClaim {
            directory: directory.into(),
        })
    }
    fn release(storage: &Storage, directory: &str) -> Result<Value> {
        storage.execute(Request::OpenRelease {
            directory: directory.into(),
        })
    }
    #[test]
    fn an_open_dynasty_is_refused_to_a_second_copy_until_released() {
        let temp = tempfile::tempdir().unwrap();
        let first = Storage::new(&temp.path().join("first")).unwrap();
        let second = Storage::new(&temp.path().join("second")).unwrap();
        let root = first.allow(temp.path()).unwrap();
        second.allow(temp.path()).unwrap();
        claim(&first, &root.path).unwrap();
        let marker = temp.path().join(OPEN_MARKER);
        assert!(marker.exists());
        let refused = claim(&second, &root.path).unwrap_err();
        assert_eq!(refused.message, "DYNASTY_OPEN_ELSEWHERE");
        // Refreshing is claiming again by the same copy.
        claim(&first, &root.path).unwrap();
        // Releasing a marker of another copy leaves it in place.
        release(&second, &root.path).unwrap();
        assert!(marker.exists());
        release(&first, &root.path).unwrap();
        assert!(!marker.exists());
        claim(&second, &root.path).unwrap();
        second.release_all();
        assert!(!marker.exists());
    }
    #[test]
    fn a_marker_left_by_a_crash_expires() {
        let temp = tempfile::tempdir().unwrap();
        let storage = Storage::new(&temp.path().join("settings")).unwrap();
        let root = storage.allow(temp.path()).unwrap();
        let marker = temp.path().join(OPEN_MARKER);
        let fresh = json!({"app":"talebranch","owner":"browser_tab","session":"open_1","updatedAt":now_ms()});
        fs::write(&marker, fresh.to_string()).unwrap();
        assert!(claim(&storage, &root.path).is_err());
        let old = now_ms() - MARKER_STALE_MS - 1000;
        let stale = json!({"app":"talebranch","owner":"browser_tab","session":"open_1","updatedAt":old});
        fs::write(&marker, stale.to_string()).unwrap();
        claim(&storage, &root.path).unwrap();
        let written: Value = serde_json::from_slice(&fs::read(&marker).unwrap()).unwrap();
        assert_eq!(written["owner"], json!(storage.owner));
        // An unreadable marker does not block opening.
        fs::write(&marker, "not json").unwrap();
        let other = Storage::new(&temp.path().join("other")).unwrap();
        other.allow(temp.path()).unwrap();
        claim(&other, &root.path).unwrap();
    }
    #[test]
    fn an_open_marker_does_not_prevent_deleting_the_dynasty() {
        let temp = tempfile::tempdir().unwrap();
        let storage = Storage::new(&temp.path().join("app-data")).unwrap();
        let folder = temp.path().join("dynasty");
        fs::create_dir(&folder).unwrap();
        let text = document("Delete");
        fs::write(folder.join(FILE_NAME), &text).unwrap();
        let dynasty = storage.allow(&folder).unwrap();
        claim(&storage, &dynasty.path).unwrap();
        version_write(&storage, &dynasty.path, VERSION, text.clone()).unwrap();
        storage
            .execute(Request::DeleteDynasty {
                directory: dynasty.path.clone(),
                expected: hash(&text),
            })
            .unwrap();
        assert!(!folder.exists());
        assert!(release(&storage, &dynasty.path).is_err());
        storage.release_all();
        assert!(!folder.exists());
    }
    #[test]
    fn last_folder_is_separate_from_dynasty_files_and_survives_restart() {
        let temp = tempfile::tempdir().unwrap();
        let data = temp.path().join("app-data");
        let storage = Storage::new(&data).unwrap();
        assert!(storage.last_folder().unwrap().is_none());
        let first = temp.path().join("Воробьёвы");
        let second = temp.path().join("Другие");
        fs::create_dir(&first).unwrap();
        fs::create_dir(&second).unwrap();
        let first = storage.allow(&first).unwrap();
        let second = storage.allow(&second).unwrap();
        storage.remember(&first.path, "Воробьёвы".into()).unwrap();
        storage.remember(&second.path, "Другие".into()).unwrap();
        storage.remember(&first.path, "Воробьёвы".into()).unwrap();
        let reopened = Storage::new(&data).unwrap();
        assert_eq!(reopened.last_folder().unwrap().unwrap().directory.path, first.path);
        assert_eq!(fs::read_dir(&first.path).unwrap().count(), 0);
        reopened.clear_last_folder().unwrap();
        assert!(Storage::new(&data).unwrap().last_folder().unwrap().is_none());
        assert_eq!(reopened.recent().unwrap().len(), 2);
    }
    #[test]
    fn deleting_a_dynasty_removes_nested_files_and_folder_but_preserves_siblings() {
        let temp = tempfile::tempdir().unwrap();
        let data = temp.path().join("app-data");
        let storage = Storage::new(&data).unwrap();
        let root = storage.allow(temp.path()).unwrap();
        let folder = temp.path().join("Воробьёвы");
        fs::create_dir(&folder).unwrap();
        fs::create_dir(folder.join("photos")).unwrap();
        fs::write(folder.join("photos/image.png"), b"Photo").unwrap();
        fs::write(temp.path().join("keep.txt"), "Keep").unwrap();
        let text = document("Воробьёвы");
        fs::write(folder.join(FILE_NAME), &text).unwrap();
        let directory = storage.allow(&folder).unwrap();
        storage.remember(&directory.path, "Воробьёвы".into()).unwrap();
        storage
            .execute(Request::DeleteDynasty {
                directory: directory.path.clone(),
                expected: hash(&text),
            })
            .unwrap();
        assert!(!folder.exists());
        assert_eq!(fs::read_to_string(temp.path().join("keep.txt")).unwrap(), "Keep");
        assert!(Path::new(&root.path).exists());
        assert!(data.exists());
        storage.forget(&directory.path).unwrap();
        assert!(storage.recent().unwrap().is_empty());
        assert!(storage.last_folder().unwrap().is_none());
    }
    #[test]
    fn recursive_deletion_rejects_conflicts_locked_folders_and_settings_ancestors() {
        let temp = tempfile::tempdir().unwrap();
        let storage = Storage::new(&temp.path().join("app-data")).unwrap();
        let root = storage.allow(temp.path()).unwrap();
        let text = document("Keep");
        fs::write(temp.path().join(FILE_NAME), &text).unwrap();
        assert!(storage
            .execute(Request::DeleteDynasty {
                directory: root.path,
                expected: hash(&text)
            })
            .is_err());
        let folder = temp.path().join("dynasty");
        fs::create_dir(&folder).unwrap();
        fs::write(folder.join(FILE_NAME), &text).unwrap();
        let directory = storage.allow(&folder).unwrap();
        assert!(storage
            .execute(Request::DeleteDynasty {
                directory: directory.path.clone(),
                expected: hash("stale")
            })
            .is_err());
        let lock = lock_directory(&folder).unwrap();
        assert!(storage
            .execute(Request::DeleteDynasty {
                directory: directory.path,
                expected: hash(&text)
            })
            .is_err());
        drop(lock);
        assert_eq!(fs::read_to_string(folder.join(FILE_NAME)).unwrap(), text);
    }
}
