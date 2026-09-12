import { useEffect, useRef, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { message, Checkbox, Select, Tooltip } from 'antd'
import { getTasks, addTask, updateTask, deleteTask, clearCompletedTasks, type TaskItem } from '@/utils/tauri'
import { logger } from '@/utils/logger'
import './TaskTodoView.css'

const TAG = 'TaskTodoView'

/** 优先级选项 */
const PRIORITY_OPTIONS = [
  { value: 0, labelKey: 'taskTodo.priorityLow' },
  { value: 1, labelKey: 'taskTodo.priorityMedium' },
  { value: 2, labelKey: 'taskTodo.priorityHigh' },
]

/** 获取优先级数字对应的标签 key */
function getPriorityLabelKey(priority: number): string {
  const option = PRIORITY_OPTIONS.find((o) => o.value === priority)
  return option?.labelKey ?? 'taskTodo.priorityMedium'
}

/** 格式化日期时间 */
function formatDateTime(isoString: string): string {
  try {
    const date = new Date(isoString)
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return isoString
  }
}

/** 任务待办视图 */
export default function TaskTodoView() {
  const { t } = useTranslation()

  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [loading, setLoading] = useState(true)
  const [addingTask, setAddingTask] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDescription, setNewTaskDescription] = useState('')
  const [newTaskPriority, setNewTaskPriority] = useState(1)
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all')
  const titleInputRef = useRef<HTMLInputElement>(null)

  /** 加载任务列表 */
  const loadTasks = useCallback(async () => {
    try {
      const list = await getTasks()
      setTasks(list)
      logger.info(TAG, `加载任务列表，共 ${list.length} 条`)
    } catch (err) {
      logger.error(TAG, `加载任务失败: ${err}`)
      message.error(String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  // 挂载时加载任务
  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  /** 开始添加任务 */
  function startAdding() {
    setAddingTask(true)
    // 等待渲染完成后聚焦输入框
    setTimeout(() => titleInputRef.current?.focus(), 50)
  }

  /** 提交新任务 */
  async function submitNewTask() {
    const title = newTaskTitle.trim()
    if (!title) {
      message.warning(t('taskTodo.titleRequired'))
      titleInputRef.current?.focus()
      return
    }

    try {
      const task = await addTask({
        title,
        description: newTaskDescription.trim() || undefined,
        priority: newTaskPriority,
      })
      setTasks((prev) => [...prev, task])
      setNewTaskTitle('')
      setNewTaskDescription('')
      setNewTaskPriority(1)
      setAddingTask(false)
      logger.info(TAG, `添加任务成功: ${task.title}`)
    } catch (err) {
      logger.error(TAG, `添加任务失败: ${err}`)
      message.error(String(err))
    }
  }

  /** 取消添加任务 */
  function cancelAdding() {
    setAddingTask(false)
    setNewTaskTitle('')
    setNewTaskDescription('')
    setNewTaskPriority(1)
  }

  /** 切换任务完成状态 */
  async function toggleTask(task: TaskItem) {
    try {
      const updated = await updateTask(task.id, { completed: !task.completed })
      if (updated) {
        setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)))
      }
    } catch (err) {
      logger.error(TAG, `切换任务状态失败: ${err}`)
      message.error(String(err))
    }
  }

  /** 更新任务优先级 */
  async function changePriority(task: TaskItem, priority: number) {
    try {
      const updated = await updateTask(task.id, { priority })
      if (updated) {
        setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)))
      }
    } catch (err) {
      logger.error(TAG, `更新优先级失败: ${err}`)
      message.error(String(err))
    }
  }

  /** 更新任务标题 */
  async function updateTitle(task: TaskItem, title: string) {
    const trimmed = title.trim()
    if (!trimmed) return
    try {
      const updated = await updateTask(task.id, { title: trimmed })
      if (updated) {
        setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)))
      }
    } catch (err) {
      logger.error(TAG, `更新标题失败: ${err}`)
      message.error(String(err))
    }
  }

  /** 更新任务描述 */
  async function updateDescription(task: TaskItem, description: string) {
    const trimmed = description.trim()
    try {
      const updated = await updateTask(task.id, { description: trimmed || null })
      if (updated) {
        setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)))
      }
    } catch (err) {
      logger.error(TAG, `更新描述失败: ${err}`)
      message.error(String(err))
    }
  }

  /** 删除任务 */
  async function handleDelete(task: TaskItem) {
    try {
      const deleted = await deleteTask(task.id)
      if (deleted) {
        setTasks((prev) => prev.filter((t) => t.id !== task.id))
        message.success(t('common.delete'))
        logger.info(TAG, `删除任务: ${task.title}`)
      }
    } catch (err) {
      logger.error(TAG, `删除任务失败: ${err}`)
      message.error(String(err))
    }
  }

  /** 清空已完成任务 */
  async function handleClearCompleted() {
    const completedCount = tasks.filter((t) => t.completed).length
    if (completedCount === 0) {
      message.info(t('taskTodo.noCompletedTasks'))
      return
    }

    try {
      const count = await clearCompletedTasks()
      setTasks((prev) => prev.filter((t) => !t.completed))
      message.success(t('taskTodo.clearedCompleted', { count }))
      logger.info(TAG, `清空 ${count} 条已完成任务`)
    } catch (err) {
      logger.error(TAG, `清空已完成任务失败: ${err}`)
      message.error(String(err))
    }
  }

  // 根据过滤条件筛选任务
  const filteredTasks = tasks.filter((task) => {
    if (filter === 'active') return !task.completed
    if (filter === 'completed') return task.completed
    return true
  })

  // 统计
  const totalCount = tasks.length
  const completedCount = tasks.filter((t) => t.completed).length
  const activeCount = totalCount - completedCount

  if (loading) {
    return (
      <div className="tasktodo-container">
        <div className="tasktodo-loading">{t('common.loading')}</div>
      </div>
    )
  }

  return (
    <div className="tasktodo-container">
      <div className="tasktodo-header">
        <div className="tasktodo-header-text">
          <h2 className="tasktodo-title">{t('taskTodo.title')}</h2>
          <p className="tasktodo-stats">
            {t('taskTodo.stats', { active: activeCount, completed: completedCount, total: totalCount })}
          </p>
        </div>
        {!addingTask && (
          <button className="tasktodo-add-btn" onClick={startAdding}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {t('taskTodo.addTask')}
          </button>
        )}
      </div>

      {/* 添加任务表单 */}
      {addingTask && (
        <div className="tasktodo-add-form">
          <input
            ref={titleInputRef}
            className="tasktodo-add-title"
            type="text"
            placeholder={t('taskTodo.titlePlaceholder')}
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitNewTask()
              if (e.key === 'Escape') cancelAdding()
            }}
          />
          <textarea
            className="tasktodo-add-description"
            placeholder={t('taskTodo.descriptionPlaceholder')}
            value={newTaskDescription}
            onChange={(e) => setNewTaskDescription(e.target.value)}
            rows={2}
          />
          <div className="tasktodo-add-footer">
            <div className="tasktodo-add-priority">
              <span className="tasktodo-add-label">{t('taskTodo.priority')}</span>
              <Select
                size="small"
                value={newTaskPriority}
                onChange={(v) => setNewTaskPriority(v)}
                style={{ width: 90 }}
                options={PRIORITY_OPTIONS.map((opt) => ({
                  value: opt.value,
                  label: t(opt.labelKey),
                }))}
              />
            </div>
            <div className="tasktodo-add-actions">
              <button className="tasktodo-btn-cancel" onClick={cancelAdding}>
                {t('common.cancel')}
              </button>
              <button className="tasktodo-btn-submit" onClick={submitNewTask}>
                {t('taskTodo.addTask')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 过滤和操作栏 */}
      <div className="tasktodo-toolbar">
        <div className="tasktodo-filters">
          <button
            className={`tasktodo-filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            {t('taskTodo.filterAll')} ({totalCount})
          </button>
          <button
            className={`tasktodo-filter-btn ${filter === 'active' ? 'active' : ''}`}
            onClick={() => setFilter('active')}
          >
            {t('taskTodo.filterActive')} ({activeCount})
          </button>
          <button
            className={`tasktodo-filter-btn ${filter === 'completed' ? 'active' : ''}`}
            onClick={() => setFilter('completed')}
          >
            {t('taskTodo.filterCompleted')} ({completedCount})
          </button>
        </div>
        {completedCount > 0 && (
          <button className="tasktodo-clear-btn" onClick={handleClearCompleted}>
            {t('taskTodo.clearCompleted')}
          </button>
        )}
      </div>

      {/* 任务列表 */}
      <div className="tasktodo-list">
        {filteredTasks.length === 0 ? (
          <div className="tasktodo-empty">
            {filter === 'all'
              ? t('taskTodo.emptyAll')
              : filter === 'active'
                ? t('taskTodo.emptyActive')
                : t('taskTodo.emptyCompleted')}
          </div>
        ) : (
          filteredTasks.map((task) => (
            <TaskItemComponent
              key={task.id}
              task={task}
              onToggle={toggleTask}
              onDelete={handleDelete}
              onPriorityChange={changePriority}
              onTitleChange={updateTitle}
              onDescriptionChange={updateDescription}
              t={t}
            />
          ))
        )}
      </div>
    </div>
  )
}

/** 单个任务项组件的 Props */
interface TaskItemProps {
  task: TaskItem
  onToggle: (task: TaskItem) => void
  onDelete: (task: TaskItem) => void
  onPriorityChange: (task: TaskItem, priority: number) => void
  onTitleChange: (task: TaskItem, title: string) => void
  onDescriptionChange: (task: TaskItem, description: string) => void
  t: (key: string) => string
}

/** 单个任务项组件 */
function TaskItemComponent({
  task,
  onToggle,
  onDelete,
  onPriorityChange,
  onTitleChange,
  onDescriptionChange,
  t,
}: TaskItemProps) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [editingDescription, setEditingDescription] = useState(false)
  const [titleValue, setTitleValue] = useState(task.title)
  const [descriptionValue, setDescriptionValue] = useState(task.description || '')

  // 标题编辑完成后保存
  function saveTitle() {
    setEditingTitle(false)
    if (titleValue.trim() !== task.title) {
      onTitleChange(task, titleValue.trim())
    }
  }

  // 描述编辑完成后保存
  function saveDescription() {
    setEditingDescription(false)
    const newDesc = descriptionValue.trim()
    if (newDesc !== (task.description || '')) {
      onDescriptionChange(task, newDesc)
    }
  }

  // 优先级颜色类
  const priorityClass = task.priority === 2 ? 'priority-high' : task.priority === 0 ? 'priority-low' : 'priority-medium'

  return (
    <div className={`tasktodo-item ${task.completed ? 'completed' : ''}`}>
      <div className="tasktodo-item-main">
        <Checkbox
          checked={task.completed}
          onChange={() => onToggle(task)}
          className="tasktodo-checkbox"
        />
        <div className="tasktodo-item-content">
          {editingTitle ? (
            <input
              className="tasktodo-edit-title"
              type="text"
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveTitle()
                if (e.key === 'Escape') {
                  setTitleValue(task.title)
                  setEditingTitle(false)
                }
              }}
              autoFocus
            />
          ) : (
            <div
              className="tasktodo-item-title"
              onDoubleClick={() => {
                if (!task.completed) {
                  setTitleValue(task.title)
                  setEditingTitle(true)
                }
              }}
              title={task.completed ? undefined : t('taskTodo.doubleClickToEdit')}
            >
              {task.title}
            </div>
          )}
          {editingDescription ? (
            <textarea
              className="tasktodo-edit-description"
              value={descriptionValue}
              onChange={(e) => setDescriptionValue(e.target.value)}
              onBlur={saveDescription}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setDescriptionValue(task.description || '')
                  setEditingDescription(false)
                }
              }}
              rows={2}
              autoFocus
            />
          ) : task.description ? (
            <div
              className="tasktodo-item-description"
              onDoubleClick={() => {
                if (!task.completed) {
                  setDescriptionValue(task.description || '')
                  setEditingDescription(true)
                }
              }}
            >
              {task.description}
            </div>
          ) : null}
          <div className="tasktodo-item-meta">
            <span className={`tasktodo-priority-tag ${priorityClass}`}>
              {t(getPriorityLabelKey(task.priority))}
            </span>
            <Tooltip title={task.created_at}>
              <span className="tasktodo-time">{formatDateTime(task.created_at)}</span>
            </Tooltip>
            {task.completed && task.completed_at && (
              <Tooltip title={t('taskTodo.completedAt') + ': ' + task.completed_at}>
                <span className="tasktodo-completed-badge">{t('taskTodo.done')}</span>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
      <div className="tasktodo-item-actions">
        <Tooltip title={t('taskTodo.changePriority')}>
          <Select
            size="small"
            value={task.priority}
            onChange={(v) => onPriorityChange(task, v)}
            style={{ width: 70 }}
            disabled={task.completed}
            options={PRIORITY_OPTIONS.map((opt) => ({
              value: opt.value,
              label: t(opt.labelKey).charAt(0),
            }))}
          />
        </Tooltip>
        <Tooltip title={t('common.delete')}>
          <button className="tasktodo-delete-btn" onClick={() => onDelete(task)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </Tooltip>
      </div>
    </div>
  )
}
