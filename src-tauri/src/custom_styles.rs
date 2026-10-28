//! The user's own styles and themes: `.css` files in `TaleBranch-data/snippets` and
//! `TaleBranch-data/themes`. Nothing outside these two folders is ever listed or read.
use crate::desktop_storage::{Result, StorageError};
use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
};

/// One file is at most 1 MB.
pub const MAX_SIZE: u64 = 1024 * 1024;
const KINDS: [&str; 2] = ["snippets", "themes"];

fn failure(message: &str) -> StorageError {
    StorageError {
        name: "Error".into(),
        message: message.into(),
    }
}

#[derive(Debug, Serialize, PartialEq)]
pub struct StyleFile {
    pub file: String,
    pub size: u64,
}
#[derive(Debug, Serialize)]
pub struct StyleList {
    pub folder: String,
    pub snippets: Vec<StyleFile>,
    pub themes: Vec<StyleFile>,
}

pub struct CustomStyles {
    root: PathBuf,
}
impl CustomStyles {
    /// `data` is `TaleBranch-data`; both folders are created when missing.
    pub fn new(data: &Path) -> Self {
        for kind in KINDS {
            let _ = fs::create_dir_all(data.join(kind));
        }
        Self {
            root: data.to_path_buf(),
        }
    }

    fn folder(&self, kind: &str) -> Result<PathBuf> {
        if !KINDS.contains(&kind) {
            return Err(failure("UNKNOWN_STYLE_FOLDER"));
        }
        let folder = self.root.join(kind);
        fs::create_dir_all(&folder)?;
        Ok(fs::canonicalize(folder)?)
    }

    /// Only a plain `name.css` directly inside the folder: no other folders, no `..`, no links.
    fn file(&self, kind: &str, file: &str) -> Result<PathBuf> {
        let folder = self.folder(kind)?;
        let valid = file.to_ascii_lowercase().ends_with(".css")
            && !file.contains(['/', '\\', ':', '\0'])
            && file != ".css"
            && !file.starts_with('.');
        if !valid {
            return Err(failure("INVALID_STYLE_NAME"));
        }
        let path = folder.join(file);
        let meta = fs::symlink_metadata(&path)?;
        if !meta.is_file() {
            return Err(failure("NOT_A_STYLE_FILE"));
        }
        let real = fs::canonicalize(&path)?;
        if real.parent() != Some(folder.as_path()) {
            return Err(failure("STYLE_OUTSIDE_FOLDER"));
        }
        if meta.len() > MAX_SIZE {
            return Err(failure("STYLE_TOO_LARGE"));
        }
        Ok(real)
    }

    fn files(&self, kind: &str) -> Result<Vec<StyleFile>> {
        let mut files = Vec::new();
        for entry in fs::read_dir(self.folder(kind)?)? {
            let entry = entry?;
            let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
                continue;
            };
            if let Ok(path) = self.file(kind, &name) {
                files.push(StyleFile {
                    file: name,
                    size: fs::metadata(path)?.len(),
                });
            }
        }
        files.sort_by(|a, b| a.file.to_lowercase().cmp(&b.file.to_lowercase()));
        Ok(files)
    }

    pub fn list(&self) -> Result<StyleList> {
        Ok(StyleList {
            folder: self.root.display().to_string(),
            snippets: self.files("snippets")?,
            themes: self.files("themes")?,
        })
    }

    pub fn read(&self, kind: &str, file: &str) -> Result<String> {
        let path = self.file(kind, file)?;
        String::from_utf8(fs::read(path)?).map_err(|_| failure("STYLE_NOT_TEXT"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_and_reads_only_css_files_inside_the_two_folders() {
        let temp = tempfile::tempdir().unwrap();
        let data = temp.path().join("TaleBranch-data");
        let styles = CustomStyles::new(&data);
        fs::write(data.join("snippets/round.css"), ".tb-avatar { border-radius: 50%; }").unwrap();
        fs::write(data.join("snippets/notes.txt"), "not a style").unwrap();
        fs::create_dir(data.join("snippets/inner.css")).unwrap();
        fs::write(data.join("themes/my-theme.css"), "/* name: Mine */").unwrap();
        fs::write(temp.path().join("secret.css"), "outside").unwrap();
        fs::write(data.join("recent-folders.css"), "outside").unwrap();

        let list = styles.list().unwrap();
        assert_eq!(
            list.snippets.iter().map(|f| f.file.as_str()).collect::<Vec<_>>(),
            ["round.css"]
        );
        assert_eq!(
            list.themes.iter().map(|f| f.file.as_str()).collect::<Vec<_>>(),
            ["my-theme.css"]
        );
        assert_eq!(
            styles.read("snippets", "round.css").unwrap(),
            ".tb-avatar { border-radius: 50%; }"
        );
        assert_eq!(styles.read("themes", "my-theme.css").unwrap(), "/* name: Mine */");
    }

    #[test]
    fn refuses_paths_outside_the_folders_and_other_files() {
        let temp = tempfile::tempdir().unwrap();
        let data = temp.path().join("TaleBranch-data");
        let styles = CustomStyles::new(&data);
        fs::write(temp.path().join("secret.css"), "outside").unwrap();
        fs::write(data.join("recent-folders.css"), "outside").unwrap();
        fs::write(data.join("snippets/notes.txt"), "text").unwrap();
        for (kind, file) in [
            ("snippets", "../recent-folders.css"),
            ("snippets", "..\\recent-folders.css"),
            ("snippets", "../../secret.css"),
            ("themes", "C:secret.css"),
            ("snippets", "notes.txt"),
            ("snippets", ".css"),
            ("snippets", "missing.css"),
            ("webview", "anything.css"),
            ("..", "secret.css"),
        ] {
            assert!(styles.read(kind, file).is_err(), "{kind}/{file} must be refused");
        }
    }

    #[test]
    fn refuses_files_over_one_megabyte() {
        let temp = tempfile::tempdir().unwrap();
        let styles = CustomStyles::new(temp.path());
        fs::write(
            temp.path().join("snippets/big.css"),
            vec![b' '; (MAX_SIZE + 1) as usize],
        )
        .unwrap();
        assert!(styles.read("snippets", "big.css").is_err());
        assert!(styles.list().unwrap().snippets.is_empty());
    }
}
