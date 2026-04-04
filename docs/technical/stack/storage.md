# Хранилище файлов: Vercel Blob

## Что это простыми словами

Место для файлов, которые загружают пользователи или которые нужны приложению: аватары, текстуры планет NASA, сгенерированные карты (PNG для шаринга), иллюстрации Таро. Vercel Blob — cloud storage, доступный по URL.

---

## Почему Vercel Blob

| Причина | Для Estrevia |
|---------|-------------|
| **Одна строка кода** | `put('avatar.png', file)` → URL. Без S3 SDK, без bucket config |
| **Vercel native** | Автоматический CDN. Файлы раздаются через edge network |
| **Public + private** | Текстуры NASA = public. Аватары = private (с auth) |
| **Простота** | На MVP нет DevOps → минимум настройки |

### Цена

| Ресурс | Стоимость |
|--------|-----------|
| Storage | $0.023/GB-month |
| Egress | $0.05/GB |
| Reads | ~$0.40/million |
| Writes | ~$5.00/million |

**Для MVP (10GB stored, 50GB egress/мес):** ~$2.70/мес.

---

## Когда менять

| Сигнал | Альтернатива | Почему |
|--------|-------------|--------|
| Storage > 100GB | **Cloudflare R2** | $0.015/GB + **НОЛЬ за egress**. Для медиа-heavy — в 3x дешевле |
| Нужен video streaming | **AWS S3 + CloudFront** | Vercel Blob не для стриминга. CloudFront HLS/DASH |
| Compliance requirements | **AWS S3** | Versioning, object locking, lifecycle policies, HIPAA |

### Cloudflare R2 vs Vercel Blob (детали)

| Аспект | Vercel Blob | Cloudflare R2 |
|--------|------------|---------------|
| Storage | $0.023/GB | $0.015/GB |
| Egress | $0.05/GB | **$0** |
| 10TB stored + 50TB egress | ~$2,730/мес | **$150/мес** |
| Setup | 1 строка кода | SDK + bucket + CORS config |
| CDN | Vercel Edge | Cloudflare Edge |

**На MVP:** Vercel Blob проще. При росте медиа (Фаза 3: музыка, видео) → R2.

---

## Вердикт

**Vercel Blob для MVP** — просто, дёшево при малом объёме, ноль конфигурации. **R2 при масштабировании** — ноль egress = драматическая экономия.
