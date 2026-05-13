//! Kafka ACL admin commands.
//!
//! The current version of the rdkafka Rust bindings does not expose
//! `AdminClient::describe_acls` and related ACL APIs. These stubs return
//! a well-known error code so the frontend can display a localized message.

use crate::storage::Database;
use serde_json::Value;
use tauri::State;

const ACL_MSG: &str = "ERR_ACL_NOT_SUPPORTED";

#[tauri::command]
pub async fn list_acls(
    _cluster_id: String,
    _db: State<'_, Database>,
) -> Result<Vec<Value>, String> {
    Err(ACL_MSG.into())
}

#[tauri::command]
pub async fn create_acl(
    _cluster_id: String,
    _acl: Value,
    _db: State<'_, Database>,
) -> Result<(), String> {
    Err(ACL_MSG.into())
}

#[tauri::command]
pub async fn delete_acl(
    _cluster_id: String,
    _acl: Value,
    _db: State<'_, Database>,
) -> Result<(), String> {
    Err(ACL_MSG.into())
}
