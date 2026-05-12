#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    kafka_manager_lib::run()
}
