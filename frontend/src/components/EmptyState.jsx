// Переиспользуемый компонент пустого состояния
// Используется на всех страницах где могут отсутствовать данные
export function EmptyState({ icon = '📭', title, description, actionLabel, onAction }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="text-5xl mb-4 opacity-60">{icon}</div>
      <p className="text-base font-semibold text-gray-600">{title}</p>
      {description && (
        <p className="text-sm text-gray-400 mt-1 max-w-xs leading-relaxed">{description}</p>
      )}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
