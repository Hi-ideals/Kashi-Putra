-- Article area mapping: clickable rectangles on newspaper pages (fractions of the page size)
CREATE TABLE IF NOT EXISTS page_areas (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  edition_id INT UNSIGNED NOT NULL,
  page_id INT UNSIGNED NOT NULL,
  x DECIMAL(8,6) NOT NULL,
  y DECIMAL(8,6) NOT NULL,
  w DECIMAL(8,6) NOT NULL,
  h DECIMAL(8,6) NOT NULL,
  title VARCHAR(255) NULL,
  description TEXT NULL,
  link_url VARCHAR(500) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pa_page (page_id, sort_order),
  INDEX idx_pa_edition (edition_id),
  CONSTRAINT fk_pa_page FOREIGN KEY (page_id) REFERENCES edition_pages(id) ON DELETE CASCADE,
  CONSTRAINT fk_pa_edition FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE,
  CONSTRAINT fk_pa_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
