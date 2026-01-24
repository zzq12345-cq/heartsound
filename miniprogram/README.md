# HeartSound Mini Program
# 心音智鉴微信小程序

## Project Structure

```
miniprogram/
├── app.js              # App entry
├── app.json            # App config
├── app.wxss            # Global styles
├── project.config.json # Project config
├── sitemap.json        # Sitemap
│
├── config/
│   └── supabase.js     # Supabase config
│
├── utils/
│   └── supabase.js     # Supabase client
│
├── services/
│   ├── device.js       # Device service
│   └── user.js         # User service
│
├── components/
│   ├── device-card/    # Device status card
│   └── health-tip/     # Health tips carousel
│
├── pages/
│   ├── index/          # Home - device connection
│   ├── connect/        # Manual IP input
│   ├── detection/      # Detection (IMPL-005)
│   ├── records/        # Health records (IMPL-006)
│   └── profile/        # User profile (IMPL-006)
│
└── static/
    └── images/         # Static images
```

## Features (IMPL-004)

- [x] Project structure with TabBar
- [x] Supabase client adaptation
- [x] Device card component (3 states)
- [x] Health tip swiper component
- [x] Home page with scan/manual connect
- [x] Manual IP input page
- [x] Device service module
- [x] User service module
- [x] 10-second heartbeat detection

## Development

1. Open with WeChat DevTools
2. Import this directory
3. Configure AppID in project.config.json

## Notes

- TabBar icons are placeholders (static/images/)
- Full detection flow in IMPL-005
- AI assistant and records in IMPL-006
