use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{collections::HashSet, fs::{self, File, OpenOptions}, io::{self, Write}, path::{Component, Path, PathBuf}, sync::Mutex};

const FILE_NAME: &str = "dynasty.json";

#[derive(Debug, Serialize)]
pub struct StorageError { pub name: String, pub message: String }
impl From<io::Error> for StorageError {
    fn from(error: io::Error) -> Self {
        let name = match error.kind() {
            io::ErrorKind::NotFound => "NotFoundError",
            io::ErrorKind::PermissionDenied => "NotAllowedError",
            io::ErrorKind::AlreadyExists => "InvalidModificationError",
            _ => "Error",
        };
        Self { name: name.into(), message: error.to_string() }
    }
}
fn failure(message: &str) -> StorageError { StorageError { name: "Error".into(), message: message.into() } }
pub type Result<T> = std::result::Result<T, StorageError>;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Directory { pub path: String, pub name: String }
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Recent { pub id: String, pub name: String, pub directory: Directory }

pub struct Storage {
    roots: Mutex<HashSet<PathBuf>>,
    settings: PathBuf,
    session: PathBuf,
    settings_lock: Mutex<()>,
}
impl Storage {
    pub fn new(data: &Path) -> io::Result<Self> {
        fs::create_dir_all(data)?;
        Ok(Self { roots: Mutex::new(HashSet::new()), settings: data.join("recent-folders.json"), session: data.join("last-folder.json"), settings_lock: Mutex::new(()) })
    }
    pub fn allow(&self, path: &Path) -> Result<Directory> {
        let path = fs::canonicalize(path)?;
        if !path.is_dir() { return Err(failure("NOT_A_DIRECTORY")); }
        self.roots.lock().unwrap().insert(path.clone());
        Ok(describe(&path))
    }
    fn directory(&self, path: &str) -> Result<PathBuf> {
        let canonical = fs::canonicalize(path)?;
        if !canonical.is_dir() || !self.roots.lock().unwrap().iter().any(|root| canonical.starts_with(root)) {
            return Err(failure("DIRECTORY_NOT_SELECTED"));
        }
        Ok(canonical)
    }
    fn file(&self, directory: &str) -> Result<PathBuf> {
        let directory = self.directory(directory)?;
        let path = directory.join(FILE_NAME);
        if let Ok(metadata) = fs::symlink_metadata(&path) {
            if metadata.file_type().is_symlink() || !metadata.is_file() { return Err(failure("INVALID_DYNASTY_FILE")); }
            if fs::canonicalize(&path)?.parent() != Some(directory.as_path()) { return Err(failure("INVALID_DYNASTY_FILE")); }
        }
        Ok(path)
    }
    pub fn execute(&self, request: Request) -> Result<Value> {
        match request {
            Request::List { directory } => {
                let entries = fs::read_dir(self.directory(&directory)?)?.map(|entry| entry.map(|entry| json!({ "name": entry.file_name().to_string_lossy() }))).collect::<io::Result<Vec<_>>>()?;
                Ok(json!(entries))
            }
            Request::Child { directory, name, create } => {
                valid_name(&name)?;
                let parent = self.directory(&directory)?;
                let child = parent.join(name);
                if create && !child.exists() { fs::create_dir(&child)?; }
                let canonical = fs::canonicalize(&child)?;
                if !canonical.starts_with(&parent) || !canonical.is_dir() { return Err(failure("INVALID_DIRECTORY")); }
                Ok(json!(describe(&canonical)))
            }
            Request::File { directory, create } => {
                let path = self.file(&directory)?;
                if create && !path.exists() { OpenOptions::new().write(true).create_new(true).open(&path)?; }
                fs::metadata(path)?;
                Ok(Value::Null)
            }
            Request::Read { directory } => {
                let text = fs::read_to_string(self.file(&directory)?)?;
                Ok(json!({ "revision": hash(&text), "text": text }))
            }
            Request::Write { directory, text, expected } => {
                // A file lock also coordinates independent portable processes.
                let directory_path = self.directory(&directory)?;
                let _lock = lock_directory(&directory_path)?;
                let path = self.file(&directory)?;
                let previous = fs::read_to_string(&path)?;
                if hash(&previous) != expected { return Err(failure("FOLDER_CONFLICT")); }
                validate_document(&text)?;
                atomic_write(&path, text.as_bytes())?;
                Ok(Value::Null)
            }
            Request::Remove { directory, name } => {
                valid_name(&name)?;
                let parent = self.directory(&directory)?;
                let path = parent.join(&name);
                let metadata = fs::symlink_metadata(&path)?;
                if metadata.file_type().is_symlink() { return Err(failure("INVALID_DIRECTORY")); }
                if metadata.is_dir() {
                    if !fs::canonicalize(&path)?.starts_with(&parent) { return Err(failure("INVALID_DIRECTORY")); }
                    fs::remove_dir(path)?; // Nonrecursive: other files are never deleted.
                } else if name == FILE_NAME {
                    let _lock = lock_directory(&parent)?;
                    fs::remove_file(self.file(&directory)?)?;
                } else { return Err(failure("UNMANAGED_FILE")); }
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
                let text = fs::read_to_string(self.file(&directory)?)?;
                if hash(&text) != expected { return Err(failure("FOLDER_CONFLICT")); }
                validate_document(&text)?;
                fs::remove_dir_all(&path)?;
                Ok(Value::Null)
            }
        }
    }
    pub fn recent(&self) -> Result<Vec<Recent>> {
        let _lock = self.settings_lock.lock().unwrap();
        let entries = self.read_recent()?;
        for entry in &entries { let _ = self.allow(Path::new(&entry.directory.path)); }
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
        let active = Recent { id: hash(&info.path), name, directory: info };
        entries.insert(0, active.clone());
        atomic_write(&self.settings, &serde_json::to_vec_pretty(&entries).map_err(|error| failure(&error.to_string()))?)?;
        atomic_write(&self.session, &serde_json::to_vec_pretty(&active).map_err(|error| failure(&error.to_string()))?)?;
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
        if let Some(entry) = &entry { self.allow(Path::new(&entry.directory.path))?; }
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
        atomic_write(&self.settings, &serde_json::to_vec_pretty(&entries).map_err(|error| failure(&error.to_string()))?)?;
        if let Ok(bytes) = fs::read(&self.session) {
            if let Ok(Some(active)) = serde_json::from_slice::<Option<Recent>>(&bytes) {
                if Path::new(&active.directory.path) == path { atomic_write(&self.session, b"null")?; }
            }
        }
        Ok(())
    }
}

#[derive(Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
pub enum Request {
    List { directory: String },
    Child { directory: String, name: String, #[serde(default)] create: bool },
    File { directory: String, #[serde(default)] create: bool },
    Read { directory: String },
    Write { directory: String, text: String, expected: String },
    Remove { directory: String, name: String },
    DeleteDynasty { directory: String, expected: String },
}
fn describe(path: &Path) -> Directory {
    Directory { path: path.to_string_lossy().into_owned(), name: path.file_name().unwrap_or(path.as_os_str()).to_string_lossy().into_owned() }
}
fn valid_name(name: &str) -> Result<()> {
    if name.is_empty() || name.contains(['/', '\\', ':']) || name.chars().any(|c| c < ' ' || "<>\"|?*".contains(c)) || name.ends_with(['.', ' ']) {
        return Err(failure("INVALID_NAME"));
    }
    let mut components = Path::new(name).components();
    if !matches!(components.next(), Some(Component::Normal(_))) || components.next().is_some() { return Err(failure("INVALID_NAME")); }
    Ok(())
}
fn hash(text: &str) -> String { format!("{:x}", Sha256::digest(text.as_bytes())) }
fn validate_document(text: &str) -> Result<()> {
    let value: Value = serde_json::from_str(text).map_err(|_| failure("INVALID_PROJECT_FORMAT"))?;
    if value["app"] != "dynasty-chronicles" || value["formatVersion"] != 1 || !value["project"].is_object() { return Err(failure("INVALID_PROJECT_FORMAT")); }
    Ok(())
}
fn lock_directory(directory: &Path) -> Result<File> {
    let file = OpenOptions::new().read(true).write(true).create(true).truncate(false).open(directory.join(".talebranch.lock"))?;
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
    fn document(name: &str) -> String { json!({"app":"dynasty-chronicles","formatVersion":1,"project":{"name":name}}).to_string() }
    #[test]
    fn native_files_round_trip_without_touching_siblings() {
        let temp = tempfile::tempdir().unwrap(); let storage = Storage::new(&temp.path().join("settings")).unwrap();
        let root = storage.allow(temp.path()).unwrap();
        let child = storage.execute(Request::Child { directory:root.path, name:"Дом Вороновых".into(), create:true }).unwrap();
        let path = child["path"].as_str().unwrap().to_string();
        storage.execute(Request::File { directory:path.clone(), create:true }).unwrap();
        let before = storage.execute(Request::Read { directory:path.clone() }).unwrap();
        let text = document("Дом Вороновых");
        storage.execute(Request::Write { directory:path.clone(), text:text.clone(), expected:before["revision"].as_str().unwrap().into() }).unwrap();
        assert_eq!(fs::read_to_string(Path::new(&path).join(FILE_NAME)).unwrap(), text);
        fs::write(Path::new(&path).join("notes.txt"), "Keep").unwrap();
        storage.execute(Request::Remove { directory:path.clone(), name:FILE_NAME.into() }).unwrap();
        assert_eq!(fs::read_to_string(Path::new(&path).join("notes.txt")).unwrap(), "Keep");
        assert!(storage.execute(Request::Remove { directory:path, name:"notes.txt".into() }).is_err());
    }
    #[test]
    fn outside_paths_and_traversal_are_rejected() {
        let temp = tempfile::tempdir().unwrap(); let other = tempfile::tempdir().unwrap();
        let storage = Storage::new(&temp.path().join("settings")).unwrap(); let root = storage.allow(temp.path()).unwrap();
        assert!(storage.execute(Request::List { directory:other.path().to_string_lossy().into_owned() }).is_err());
        for name in ["..", "../escape", "C:\\outside", "a/b", "a:stream"] {
            assert!(storage.execute(Request::Child { directory:root.path.clone(), name:name.into(), create:true }).is_err());
        }
    }
    #[test]
    fn conflicting_or_invalid_writes_preserve_original() {
        let temp = tempfile::tempdir().unwrap(); let storage = Storage::new(&temp.path().join("settings")).unwrap();
        let root = storage.allow(temp.path()).unwrap(); let original = document("Original");
        fs::write(temp.path().join(FILE_NAME), &original).unwrap();
        assert!(storage.execute(Request::Write { directory:root.path.clone(), text:document("Changed"), expected:hash("stale") }).is_err());
        assert!(storage.execute(Request::Write { directory:root.path, text:"{}".into(), expected:hash(&original) }).is_err());
        assert_eq!(fs::read_to_string(temp.path().join(FILE_NAME)).unwrap(), original);
    }
    #[test]
    fn recent_folders_survive_restart_without_copying_content() {
        let temp = tempfile::tempdir().unwrap(); let data = temp.path().join("settings");
        let storage = Storage::new(&data).unwrap(); let root = storage.allow(temp.path()).unwrap();
        storage.remember(&root.path, "Имя".into()).unwrap();
        let reopened = Storage::new(&data).unwrap(); let recent = reopened.recent().unwrap();
        assert_eq!(recent.len(),1); assert_eq!(recent[0].name,"Имя");
        assert!(reopened.execute(Request::List { directory:root.path.clone() }).is_ok());
        reopened.forget(&root.path).unwrap(); assert!(reopened.recent().unwrap().is_empty());
    }
    #[test]
    fn a_locked_dynasty_cannot_be_written_by_a_second_process() {
        let temp = tempfile::tempdir().unwrap(); let first = lock_directory(temp.path()).unwrap();
        assert!(lock_directory(temp.path()).is_err()); drop(first);
        assert!(lock_directory(temp.path()).is_ok());
    }
    #[test]
    fn last_folder_is_separate_from_dynasty_files_and_survives_restart() {
        let temp = tempfile::tempdir().unwrap(); let data = temp.path().join("app-data");
        let storage = Storage::new(&data).unwrap();
        assert!(storage.last_folder().unwrap().is_none());
        let first = temp.path().join("Воробьёвы"); let second = temp.path().join("Другие");
        fs::create_dir(&first).unwrap(); fs::create_dir(&second).unwrap();
        let first = storage.allow(&first).unwrap(); let second = storage.allow(&second).unwrap();
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
        let temp = tempfile::tempdir().unwrap(); let data = temp.path().join("app-data");
        let storage = Storage::new(&data).unwrap(); let root = storage.allow(temp.path()).unwrap();
        let folder = temp.path().join("Воробьёвы"); fs::create_dir(&folder).unwrap();
        fs::create_dir(folder.join("photos")).unwrap(); fs::write(folder.join("photos/image.png"), b"Photo").unwrap();
        fs::write(temp.path().join("keep.txt"), "Keep").unwrap();
        let text = document("Воробьёвы"); fs::write(folder.join(FILE_NAME), &text).unwrap();
        let directory = storage.allow(&folder).unwrap(); storage.remember(&directory.path, "Воробьёвы".into()).unwrap();
        storage.execute(Request::DeleteDynasty { directory: directory.path.clone(), expected: hash(&text) }).unwrap();
        assert!(!folder.exists()); assert_eq!(fs::read_to_string(temp.path().join("keep.txt")).unwrap(), "Keep");
        assert!(Path::new(&root.path).exists()); assert!(data.exists());
        storage.forget(&directory.path).unwrap();
        assert!(storage.recent().unwrap().is_empty()); assert!(storage.last_folder().unwrap().is_none());
    }
    #[test]
    fn recursive_deletion_rejects_conflicts_locked_folders_and_settings_ancestors() {
        let temp = tempfile::tempdir().unwrap(); let storage = Storage::new(&temp.path().join("app-data")).unwrap();
        let root = storage.allow(temp.path()).unwrap(); let text = document("Keep");
        fs::write(temp.path().join(FILE_NAME), &text).unwrap();
        assert!(storage.execute(Request::DeleteDynasty { directory: root.path, expected: hash(&text) }).is_err());
        let folder = temp.path().join("dynasty"); fs::create_dir(&folder).unwrap(); fs::write(folder.join(FILE_NAME), &text).unwrap();
        let directory = storage.allow(&folder).unwrap();
        assert!(storage.execute(Request::DeleteDynasty { directory: directory.path.clone(), expected: hash("stale") }).is_err());
        let lock = lock_directory(&folder).unwrap();
        assert!(storage.execute(Request::DeleteDynasty { directory: directory.path, expected: hash(&text) }).is_err());
        drop(lock); assert_eq!(fs::read_to_string(folder.join(FILE_NAME)).unwrap(), text);
    }
}
