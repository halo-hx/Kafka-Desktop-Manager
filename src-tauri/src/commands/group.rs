use crate::commands::kafka_util::db_run;
use crate::storage::{ConnectionGroupRow, Database};
use serde::Deserialize;
use serde_json::{to_value, Value};
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
struct GroupPayload {
    id: Option<String>,
    name: Option<String>,
    sort_order: Option<i32>,
    parent_id: Option<String>,
}

#[tauri::command]
pub async fn load_connection_groups(db: State<'_, Database>) -> Result<Vec<Value>, String> {
    let db = (*db).clone();
    let rows = db_run(db, |database| database.list_groups()).await?;
    rows.into_iter()
        .map(|row| to_value(row).map_err(|e| e.to_string()))
        .collect()
}

#[tauri::command]
pub async fn save_connection_group(
    db: State<'_, Database>,
    group: Value,
) -> Result<String, String> {
    let inner = group.get("group").cloned().unwrap_or(group);
    let payload: GroupPayload = serde_json::from_value(inner).map_err(|e| e.to_string())?;

    let id = payload
        .id
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .map(String::from)
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    let row = ConnectionGroupRow {
        id: id.clone(),
        name: payload.name.unwrap_or_else(|| "Untitled".into()),
        sort_order: payload.sort_order.unwrap_or(0),
        parent_id: payload.parent_id,
    };

    let db = (*db).clone();
    db_run(db, move |database| database.save_group(&row)).await?;

    Ok(id)
}

#[tauri::command]
pub async fn delete_connection_group(
    db: State<'_, Database>,
    group_id: String,
) -> Result<(), String> {
    let db = (*db).clone();
    db_run(db, move |database| database.delete_group(&group_id)).await
}
