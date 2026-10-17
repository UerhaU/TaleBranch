mod desktop_storage;
use desktop_storage::{Directory, Recent, Request, Storage, StorageError};
use std::{path::PathBuf, sync::Arc};
use tauri_plugin_dialog::DialogExt;

fn portable_data() -> std::io::Result<PathBuf> {
    let executable = std::env::current_exe()?;
    Ok(executable.parent().ok_or_else(|| std::io::Error::other("Executable has no directory"))?.join("TaleBranch-data"))
}
fn join_error(error: impl std::fmt::Display) -> StorageError { StorageError { name:"Error".into(), message:error.to_string() } }
#[tauri::command]
fn app_version() -> &'static str { env!("CARGO_PKG_VERSION") }
#[tauri::command]
async fn desktop_pick_directory(app: tauri::AppHandle, storage: tauri::State<'_, Arc<Storage>>) -> desktop_storage::Result<Option<Directory>> {
    let storage = storage.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        app.dialog().file().blocking_pick_folder().map(|selected| {
            let path = selected.into_path().map_err(join_error)?;
            storage.allow(&path)
        }).transpose()
    }).await.map_err(join_error)?
}
#[tauri::command]
async fn desktop_io(request: Request, storage: tauri::State<'_, Arc<Storage>>) -> desktop_storage::Result<serde_json::Value> {
    let storage = storage.inner().clone();
    tauri::async_runtime::spawn_blocking(move || storage.execute(request)).await.map_err(join_error)?
}
#[tauri::command]
fn desktop_recent_folders(storage: tauri::State<'_, Arc<Storage>>) -> desktop_storage::Result<Vec<Recent>> { storage.recent() }
#[tauri::command]
fn desktop_remember_folder(directory: String, name: String, storage: tauri::State<'_, Arc<Storage>>) -> desktop_storage::Result<()> { storage.remember(&directory, name) }
#[tauri::command]
fn desktop_forget_folder(directory: String, storage: tauri::State<'_, Arc<Storage>>) -> desktop_storage::Result<()> { storage.forget(&directory) }
#[tauri::command]
async fn desktop_save_export(app: tauri::AppHandle, name: String, contents: String, png: bool) -> desktop_storage::Result<bool> {
    tauri::async_runtime::spawn_blocking(move || {
        let picker = app.dialog().file().set_file_name(name);
        let picker = if png { picker.add_filter("PNG", &["png"]) } else { picker.add_filter("TaleBranch", &["dynasty-tree", "json"]) };
        let Some(selected) = picker.blocking_save_file() else { return Ok(false); };
        let path = selected.into_path().map_err(join_error)?;
        let bytes = if png {
            use base64::Engine;
            base64::engine::general_purpose::STANDARD.decode(contents).map_err(join_error)?
        } else { contents.into_bytes() };
        desktop_storage::atomic_write(&path, &bytes)?;
        Ok(true)
    }).await.map_err(join_error)?
}

/// Headless check of the packaged executable; never opens or controls a UI.
pub fn self_test() -> Result<(), Box<dyn std::error::Error>> {
    let data = portable_data()?;
    std::fs::create_dir_all(&data)?;
    let temporary = tempfile::Builder::new().prefix("self-test-").tempdir_in(&data)?;
    let storage = Storage::new(&temporary.path().join("settings"))?;
    let selected = storage.allow(temporary.path()).map_err(|error| error.message)?;
    let child = storage.execute(Request::Child { directory:selected.path, name:"Проверка portable".into(), create:true }).map_err(|error| error.message)?;
    let directory = child["path"].as_str().ok_or("Missing directory")?.to_string();
    storage.execute(Request::File { directory:directory.clone(), create:true }).map_err(|error| error.message)?;
    let read = storage.execute(Request::Read { directory:directory.clone() }).map_err(|error| error.message)?;
    let text = r#"{"app":"dynasty-chronicles","formatVersion":1,"project":{"name":"Проверка"}}"#;
    storage.execute(Request::Write { directory:directory.clone(), text:text.into(), expected:read["revision"].as_str().unwrap().into() }).map_err(|error| error.message)?;
    let saved = storage.execute(Request::Read { directory:directory.clone() }).map_err(|error| error.message)?;
    if saved["text"] != text { return Err("File round trip failed".into()); }
    storage.remember(&directory, "Проверка".into()).map_err(|error| error.message)?;
    if storage.recent().map_err(|error| error.message)?.len() != 1 { return Err("Recent folders failed".into()); }
    storage.execute(Request::Remove { directory, name:"dynasty.json".into() }).map_err(|error| error.message)?;
    let context: tauri::Context<tauri::Wry> = tauri::generate_context!();
    if context.assets().get(&"index.html".into()).is_none() { return Err("Embedded interface is missing".into()); }
    let asset_count = context.assets().iter().count();
    let icon_count = context.assets().iter().filter(|(name, _)| name.starts_with("/game-icons/")).count();
    if asset_count < 3 { return Err("Embedded interface resources are missing".into()); }
    let report = serde_json::json!({ "result":"passed", "version":env!("CARGO_PKG_VERSION"), "embeddedAssets":asset_count, "embeddedGameIcons":icon_count, "nativeFileRoundTrip":true, "serverRequired":false });
    desktop_storage::atomic_write(&data.join("self-test-result.json"), serde_json::to_string_pretty(&report)?.as_bytes())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let data = portable_data().expect("Could not locate the portable application directory");
    let storage = Arc::new(Storage::new(&data).expect("Could not create TaleBranch-data beside the portable application"));
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(storage)
        .setup(move |app| {
            tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("index.html".into()))
                .title("TaleBranch").inner_size(1440.0,900.0).min_inner_size(1024.0,720.0).center()
                .data_directory(data.join("webview"))
                .build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![app_version, desktop_pick_directory, desktop_io, desktop_recent_folders, desktop_remember_folder, desktop_forget_folder, desktop_save_export])
        .run(tauri::generate_context!())
        .expect("failed to run TaleBranch");
}
