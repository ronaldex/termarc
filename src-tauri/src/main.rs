#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if std::env::args_os().len() > 1 {
        termdeck_lib::cli::run();
    } else {
        termdeck_lib::run();
    }
}
