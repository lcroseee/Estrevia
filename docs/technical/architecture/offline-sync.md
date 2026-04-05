# Offline Strategy

## MVP: не реализуется

MVP не включает offline-функциональность. Все функции требуют сетевого подключения.

PWA manifest обеспечивает установку на домашний экран (standalone window, splash screen), но без кэширования контента.

## Phase 2: plan

При необходимости (по данным analytics — сколько пользователей теряем из-за отсутствия сети):
- Service Worker для кэширования эссе (~5MB)
- IndexedDB для сохранённых карт
- Stale-while-revalidate для лунного календаря
