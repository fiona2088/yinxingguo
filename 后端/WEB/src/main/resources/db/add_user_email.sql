-- 邮箱验证码注册：为 user 表增加 email 字段（在 MySQL 中执行一次即可）
USE A08;

ALTER TABLE `user`
    ADD COLUMN email VARCHAR(128) NULL COMMENT '注册邮箱' AFTER password;

CREATE UNIQUE INDEX uk_user_email ON `user` (email);
