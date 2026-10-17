#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if std::env::args().any(|arg| arg == "--self-test") {
        if let Err(error) = talebranch_lib::self_test() {
            eprintln!("{error}");
            std::process::exit(1);
        }
        return;
    }
    talebranch_lib::run();
}
