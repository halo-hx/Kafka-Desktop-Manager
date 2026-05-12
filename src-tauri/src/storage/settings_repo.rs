use super::Database;
use crate::error::AppError;
use rusqlite::params;
use std::collections::HashMap;

pub struct AppSettingsRow {
    pub key: String,
    pub value: String,
}

impl Database {
    pub fn get_setting(&self, key: &str) -> Result<Option<String>, AppError> {
        self.with_conn(|db| {
            let mut stmt = db
                .prepare("SELECT value FROM app_settings WHERE key = ?1")
                .map_err(|e| AppError::Storage(e.to_string()))?;
            let mut rows = stmt
                .query(params![key])
                .map_err(|e| AppError::Storage(e.to_string()))?;
            match rows.next().map_err(|e| AppError::Storage(e.to_string()))? {
                Some(row) => {
                    let v: String = row.get(0).map_err(|e| AppError::Storage(e.to_string()))?;
                    Ok(Some(v))
                }
                None => Ok(None),
            }
        })
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), AppError> {
        self.with_conn(|db| {
            db.execute(
                r#"
                INSERT INTO app_settings (key, value) VALUES (?1, ?2)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
                "#,
                params![key, value],
            )
            .map_err(|e| AppError::Storage(e.to_string()))?;
            Ok(())
        })
    }

    pub fn get_all_settings(&self) -> Result<HashMap<String, String>, AppError> {
        self.with_conn(|db| {
            let mut stmt = db
                .prepare("SELECT key, value FROM app_settings")
                .map_err(|e| AppError::Storage(e.to_string()))?;
            let rows = stmt
                .query_map([], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                })
                .map_err(|e| AppError::Storage(e.to_string()))?;
            let mut map = HashMap::new();
            for row in rows {
                let (k, v) = row.map_err(|e| AppError::Storage(e.to_string()))?;
                map.insert(k, v);
            }
            Ok(map)
        })
    }
}
