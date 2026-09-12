use crate::error::AppError;
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;

/// 任务条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskItem {
    /// 任务 ID
    pub id: i64,
    /// 任务标题
    pub title: String,
    /// 任务描述（可选）
    pub description: Option<String>,
    /// 是否已完成
    pub completed: bool,
    /// 优先级（0=低, 1=中, 2=高）
    pub priority: i32,
    /// 创建时间（ISO 8601 格式）
    pub created_at: String,
    /// 更新时间（ISO 8601 格式）
    pub updated_at: String,
    /// 完成时间（ISO 8601 格式），未完成时为 null
    pub completed_at: Option<String>,
}

/// 创建任务的请求数据
#[derive(Debug, Clone, Deserialize)]
pub struct NewTask {
    /// 任务标题
    pub title: String,
    /// 任务描述（可选）
    pub description: Option<String>,
    /// 优先级（0=低, 1=中, 2=高），默认为 1
    pub priority: Option<i32>,
}

/// 更新任务的请求数据
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateTask {
    /// 任务标题（可选）
    pub title: Option<String>,
    /// 任务描述（可选）
    pub description: Option<Option<String>>,
    /// 是否已完成（可选）
    pub completed: Option<bool>,
    /// 优先级（可选）
    pub priority: Option<i32>,
}

/// 任务待办数据管理服务
pub struct TaskService {
    db_path: String,
}

impl TaskService {
    /// 创建任务服务实例
    pub fn new(db_path: &Path) -> Result<Self, AppError> {
        let service = TaskService {
            db_path: db_path.to_string_lossy().to_string(),
        };
        service.init_db()?;
        Ok(service)
    }

    /// 初始化数据库连接并创建表
    fn init_db(&self) -> Result<(), AppError> {
        let conn = Connection::open(&self.db_path)
            .map_err(|e| AppError::DatabaseError(format!("打开任务数据库失败: {}", e)))?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT,
                completed BOOLEAN NOT NULL DEFAULT 0,
                priority INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                completed_at TEXT
            )",
            [],
        )
        .map_err(|e| AppError::DatabaseError(format!("创建任务表失败: {}", e)))?;

        // 创建索引：按创建时间倒序查询
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC)",
            [],
        )
        .map_err(|e| AppError::DatabaseError(format!("创建索引失败: {}", e)))?;

        // 创建索引：按完成状态和优先级查询
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_tasks_completed_priority ON tasks(completed, priority DESC)",
            [],
        )
        .map_err(|e| AppError::DatabaseError(format!("创建索引失败: {}", e)))?;

        Ok(())
    }

    /// 获取所有任务列表
    pub fn get_all_tasks(&self) -> Result<Vec<TaskItem>, AppError> {
        let conn = Connection::open(&self.db_path)
            .map_err(|e| AppError::DatabaseError(format!("打开任务数据库失败: {}", e)))?;

        let mut stmt = conn.prepare(
            "SELECT id, title, description, completed, priority, created_at, updated_at, completed_at
             FROM tasks ORDER BY completed ASC, priority DESC, created_at DESC",
        )
        .map_err(|e| AppError::DatabaseError(format!("准备查询失败: {}", e)))?;

        let tasks = stmt
            .query_map([], |row| {
                Ok(TaskItem {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    description: row.get(2)?,
                    completed: row.get(3)?,
                    priority: row.get(4)?,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                    completed_at: row.get(7)?,
                })
            })
            .map_err(|e| AppError::DatabaseError(format!("查询任务失败: {}", e)))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| AppError::DatabaseError(format!("读取任务数据失败: {}", e)))?;

        Ok(tasks)
    }

    /// 根据 ID 获取单个任务
    pub fn get_task(&self, id: i64) -> Result<Option<TaskItem>, AppError> {
        let conn = Connection::open(&self.db_path)
            .map_err(|e| AppError::DatabaseError(format!("打开任务数据库失败: {}", e)))?;

        let result = conn
            .query_row(
                "SELECT id, title, description, completed, priority, created_at, updated_at, completed_at
                 FROM tasks WHERE id = ?1",
                params![id],
                |row| {
                    Ok(TaskItem {
                        id: row.get(0)?,
                        title: row.get(1)?,
                        description: row.get(2)?,
                        completed: row.get(3)?,
                        priority: row.get(4)?,
                        created_at: row.get(5)?,
                        updated_at: row.get(6)?,
                        completed_at: row.get(7)?,
                    })
                },
            )
            .optional()
            .map_err(|e| AppError::DatabaseError(format!("查询任务失败: {}", e)))?;

        Ok(result)
    }

    /// 添加新任务
    pub fn add_task(&self, new_task: NewTask) -> Result<TaskItem, AppError> {
        let conn = Connection::open(&self.db_path)
            .map_err(|e| AppError::DatabaseError(format!("打开任务数据库失败: {}", e)))?;

        let now = Utc::now().to_rfc3339();
        let priority = new_task.priority.unwrap_or(1);

        conn.execute(
            "INSERT INTO tasks (title, description, completed, priority, created_at, updated_at, completed_at)
             VALUES (?1, ?2, 0, ?3, ?4, ?4, NULL)",
            params![
                new_task.title,
                new_task.description,
                priority,
                now,
            ],
        )
        .map_err(|e| AppError::DatabaseError(format!("插入任务失败: {}", e)))?;

        let id = conn.last_insert_rowid();

        self.get_task(id)?
            .ok_or_else(|| AppError::DatabaseError("插入后查询任务失败".to_string()))
    }

    /// 更新任务
    pub fn update_task(&self, id: i64, update: UpdateTask) -> Result<Option<TaskItem>, AppError> {
        let conn = Connection::open(&self.db_path)
            .map_err(|e| AppError::DatabaseError(format!("打开任务数据库失败: {}", e)))?;

        // 先检查任务是否存在
        if self.get_task(id)?.is_none() {
            return Ok(None);
        }

        let now = Utc::now().to_rfc3339();

        // 构建动态更新语句
        let mut updates: Vec<String> = Vec::new();
        let mut params_vec: Vec<rusqlite::types::Value> = Vec::new();

        if let Some(title) = update.title {
            updates.push("title = ?".to_string());
            params_vec.push(title.into());
        }

        if let Some(desc) = update.description {
            updates.push("description = ?".to_string());
            params_vec.push(desc.map(|s| s.into()).unwrap_or(rusqlite::types::Value::Null));
        }

        if let Some(completed) = update.completed {
            updates.push("completed = ?".to_string());
            params_vec.push((completed as i64).into());

            // 设置或清除完成时间
            if completed {
                updates.push("completed_at = ?".to_string());
                params_vec.push(now.clone().into());
            } else {
                updates.push("completed_at = NULL".to_string());
            }
        }

        if let Some(priority) = update.priority {
            updates.push("priority = ?".to_string());
            params_vec.push((priority as i64).into());
        }

        if !updates.is_empty() {
            updates.push("updated_at = ?".to_string());
            params_vec.push(now.into());
            params_vec.push((id as i64).into());

            let sql = format!("UPDATE tasks SET {} WHERE id = ?", updates.join(", "));
            let params_ref: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|v| v as &dyn rusqlite::ToSql).collect();

            conn.execute(&sql, params_ref.as_slice())
                .map_err(|e| AppError::DatabaseError(format!("更新任务失败: {}", e)))?;
        }

        self.get_task(id)
    }

    /// 删除任务
    pub fn delete_task(&self, id: i64) -> Result<bool, AppError> {
        let conn = Connection::open(&self.db_path)
            .map_err(|e| AppError::DatabaseError(format!("打开任务数据库失败: {}", e)))?;

        let affected = conn
            .execute("DELETE FROM tasks WHERE id = ?1", params![id])
            .map_err(|e| AppError::DatabaseError(format!("删除任务失败: {}", e)))?;

        Ok(affected > 0)
    }

    /// 清空所有已完成的任务
    pub fn clear_completed(&self) -> Result<usize, AppError> {
        let conn = Connection::open(&self.db_path)
            .map_err(|e| AppError::DatabaseError(format!("打开任务数据库失败: {}", e)))?;

        let affected = conn
            .execute("DELETE FROM tasks WHERE completed = 1", [])
            .map_err(|e| AppError::DatabaseError(format!("清空已完成任务失败: {}", e)))?;

        Ok(affected)
    }
}
