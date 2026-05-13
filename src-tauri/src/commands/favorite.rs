use crate::commands::kafka_util::{db_run, get_connection_or_err};
use crate::storage::Database;
use tauri::State;

#[tauri::command]
pub async fn toggle_connection_favorite(
    db: State<'_, Database>,
    connection_id: String,
) -> Result<bool, String> {
    let conn = get_connection_or_err(&db, &connection_id).await?;
    let new_val = !conn.is_favorite;
    let db = (*db).clone();
    let cid = connection_id.clone();
    db_run(db, move |database| database.update_favorite(&cid, new_val)).await?;
    Ok(new_val)
}

#[tauri::command]
pub async fn set_connection_color_tag(
    db: State<'_, Database>,
    connection_id: String,
    color_tag: Option<String>,
) -> Result<(), String> {
    let db = (*db).clone();
    db_run(db, move |database| {
        database.update_color_tag(&connection_id, color_tag.as_deref())
    })
    .await
}
