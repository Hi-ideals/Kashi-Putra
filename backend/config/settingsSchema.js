/**
 * Every configurable setting lives here, with its default value.
 * type: string | bool | number | json | image | secret
 * public: exposed to the public website via /settings/public
 */
const S = (def, type = 'string', pub = true) => ({ def, type, public: pub });

module.exports = {
  website_settings: {
    site_name: S('Vachana Kranti'),
    site_title: S('Vachana Kranti ePaper - Read Today\'s Newspaper Online'),
    tagline: S('Kannada Daily Newspaper'),
    site_logo: S('', 'image'),
    header_logo: S('', 'image'),
    footer_logo: S('', 'image'),
    favicon: S('', 'image'),
    admin_logo: S('', 'image'), // admin sidebar + login badge (falls back to favicon, then initials)
    admin_panel_title: S('Admin Panel'),
    site_url: S('http://localhost:5173'),
    contact_email: S('contact@example.com'),
    contact_phone: S('+91 00000 00000'),
    address: S('Karnataka, India'),
    default_category_id: S(0, 'number'),
    default_date_mode: S('latest'), // latest | today
    default_page: S(1, 'number'),
    date_format: S('DD-MM-YYYY'),
    timezone: S('Asia/Kolkata'),
    default_language: S('en'),
    enabled_languages: S('en,kn'),
    copyright_text: S('© {year} Vachana Kranti. All rights reserved.'),
    footer_content: S('Read the complete newspaper online, every day. Latest editions, district editions and archives.'),
    important_links: S([{ label: 'About Us', url: '/page/about-us' }, { label: 'Contact Us', url: '/page/contact-us' }], 'json'),
    maintenance_mode: S(false, 'bool'),
    maintenance_message: S('We are performing scheduled maintenance. Please check back soon.'),
    allow_registration: S(true, 'bool'),
    enable_subscriptions: S(true, 'bool'),
    allow_pdf_upload: S(true, 'bool'),
    google_client_id: S(''),
    latest_editions_count: S(8, 'number'),
    // Viewer action controls (Action Management)
    action_crop: S(true, 'bool'),
    action_share: S(true, 'bool'),
    action_download: S(true, 'bool'),
    action_print: S(true, 'bool'),
    action_fullscreen: S(true, 'bool'),
    action_zoom: S(true, 'bool'),
    action_thumbnails: S(true, 'bool'),
    action_archive: S(true, 'bool'),
    action_page_select: S(true, 'bool'),
    // Comments
    comments_enabled: S(true, 'bool'),
    comments_require_approval: S(true, 'bool'),
    comment_max_length: S(200, 'number'),
    comment_rate_per_hour: S(10, 'number'),
    comment_blocked_words: S('', 'string', false),
    comment_auto_spam_links: S(true, 'bool', false),
    // SEO global
    robots_txt: S('User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/', 'string', false),
    sitemap_enabled: S(true, 'bool', false),
    // Push
    push_enabled: S(true, 'bool'),
    push_auto_on_publish: S(true, 'bool', false),
    push_prompt_delay: S(15, 'number'),
    vapid_public_key: S(''),
    vapid_private_key: S('', 'secret', false),
    // Subscribers
    subscriber_email_on_publish: S(false, 'bool', false),
  },
  theme_settings: {
    theme_name: S('classic'),
    primary_color: S('#0e5aa7'),
    secondary_color: S('#0f1f3d'),
    header_bg: S('#ffffff'),
    header_text: S('#0f1f3d'),
    footer_bg: S('#0f1f3d'),
    footer_text: S('#e8edf5'),
    font_family: S('"Noto Sans Kannada", "Noto Sans", system-ui, sans-serif'),
    font_size: S(15, 'number'),
    logo_height: S(56, 'number'),
    logo_width: S(0, 'number'),
    layout: S('wide'), // wide | boxed
    dark_mode_enabled: S(true, 'bool'),
    default_mode: S('light'),
  },
  watermark_settings: {
    enabled: S(false, 'bool'),
    type: S('text'), // text | logo | both
    text: S('Vachana Kranti ePaper'),
    logo: S('', 'image'),
    position: S('center'), // center|top-left|top-right|bottom-left|bottom-right|tile
    opacity: S(0.15, 'number'),
    size: S(55, 'number'), // % of page width
    color: S('#000000'),
    rotation: S(-30, 'number'),
    apply_to_clips: S(true, 'bool'),
  },
  pwa_settings: {
    app_name: S('Vachana Kranti ePaper'),
    short_name: S('ePaper'),
    description: S('Read the daily newspaper online'),
    logo: S('', 'image'),
    icon: S('', 'image'),
    theme_color: S('#0e5aa7'),
    background_color: S('#ffffff'),
    display: S('standalone'),
    orientation: S('any'),
    start_url: S('/'),
  },
  recaptcha_settings: {
    enabled: S(false, 'bool'),
    version: S('v2'), // v2 | v3
    site_key: S(''),
    secret_key: S('', 'secret', false),
    min_score: S(0.5, 'number'),
    on_login: S(true, 'bool'),
    on_register: S(true, 'bool'),
    on_comment: S(true, 'bool'),
    on_subscribe: S(true, 'bool'),
    on_contact: S(true, 'bool'),
  },
  backup_settings: {
    auto_enabled: S(false, 'bool', false),
    frequency: S('daily', 'string', false), // daily | weekly | monthly
    time: S('02:00', 'string', false), // HH:mm (server local time)
    weekday: S(0, 'number', false), // 0 = Sunday … 6 = Saturday (weekly)
    month_day: S(1, 'number', false), // 1–31 (monthly; uses the last day in shorter months)
    include_media: S(true, 'bool', false),
    keep_count: S(7, 'number', false), // automatic backups to keep
    last_auto_at: S('', 'string', false),
  },
};
