-- Kênh hội thoại mới: `zalo_ca_nhan` (nick Zalo cá nhân chạy qua công cụ ngoài — ZCRM).
--
-- Postgres không cho thêm nhãn enum trong cùng giao dịch với câu dùng nhãn đó, và `drizzle-kit push`
-- gói mọi thứ vào một giao dịch, nên nhãn phải được thêm TRƯỚC khi push tạo bảng `channel_accounts`.
-- Chạy lại nhiều lần vẫn an toàn nhờ IF NOT EXISTS.

ALTER TYPE msg_channel ADD VALUE IF NOT EXISTS 'zalo_ca_nhan';
