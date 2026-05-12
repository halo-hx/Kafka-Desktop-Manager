mod commands;
mod error;
pub mod storage;

use commands::{acl, cluster, connect, consumer, favorite, group, message, schema, topic};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .format_timestamp_millis()
        .init();
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init());

    #[cfg(debug_assertions)]
    {
        builder = builder.plugin(tauri_plugin_mcp_bridge::init());
    }

    builder
        .setup(|app| {
            let db = storage::open_database_for_app(app)
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;
            app.manage(db);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            cluster::load_connections,
            cluster::save_connection,
            cluster::delete_connection,
            cluster::test_connection,
            cluster::connect_cluster,
            cluster::disconnect_cluster,
            cluster::get_broker_config,
            cluster::alter_cluster_configs,
            topic::load_cluster_topics,
            topic::create_topic,
            topic::delete_topic,
            topic::load_cluster_overview,
            consumer::load_consumer_groups,
            consumer::describe_consumer_group,
            consumer::preview_reset_offsets,
            consumer::delete_consumer_group,
            consumer::reset_consumer_group_offsets,
            group::load_connection_groups,
            group::save_connection_group,
            group::delete_connection_group,
            favorite::toggle_connection_favorite,
            favorite::set_connection_color_tag,
            message::fetch_messages,
            message::send_message,
            schema::list_subjects,
            schema::list_schema_versions,
            schema::get_schema,
            schema::register_schema,
            schema::check_compatibility,
            schema::set_compatibility,
            schema::get_subject_compatibility,
            connect::list_connectors,
            connect::get_connector_detail,
            connect::create_connector,
            connect::update_connector_config,
            connect::validate_connector_config,
            connect::pause_connector,
            connect::resume_connector,
            connect::restart_connector,
            connect::delete_connector,
            connect::restart_task,
            acl::list_acls,
            acl::create_acl,
            acl::delete_acl,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
