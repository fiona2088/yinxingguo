package web.service.impl;

import jakarta.mail.internet.MimeMessage;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import web.enumeration.MessageEnum;
import web.exception.BaseException;
import web.service.EmailVerificationService;

import java.time.Duration;
import java.util.concurrent.ThreadLocalRandom;
import java.util.regex.Pattern;

@Slf4j
@Service
public class EmailVerificationServiceImpl implements EmailVerificationService {

    private static final Pattern EMAIL_PATTERN =
            Pattern.compile("^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$");
    private static final String CODE_KEY_PREFIX = "a08:email:register:code:";
    private static final String SEND_LIMIT_PREFIX = "a08:email:register:limit:";
    private static final Duration CODE_TTL = Duration.ofMinutes(5);
    private static final Duration SEND_INTERVAL = Duration.ofSeconds(60);

    @Autowired
    private JavaMailSender mailSender;

    @Autowired
    private StringRedisTemplate stringRedisTemplate;

    @Value("${spring.mail.username}")
    private String mailFrom;

    /**
     * 发送验证码
     * @param email
     */
    @Override
    public void sendRegisterCode(String email) {
        String normalized = normalizeEmail(email);
        assertValidEmail(normalized);

        if (stringRedisTemplate.hasKey(SEND_LIMIT_PREFIX + normalized)) {
            throw new BaseException(MessageEnum.EMAIL_SEND_TOO_FREQUENT);
        }

        String code = String.format("%06d", ThreadLocalRandom.current().nextInt(1_000_000));
        stringRedisTemplate.opsForValue().set(CODE_KEY_PREFIX + normalized, code, CODE_TTL);
        stringRedisTemplate.opsForValue().set(SEND_LIMIT_PREFIX + normalized, "1", SEND_INTERVAL);

        sendMail(normalized, code);
        log.info("注册验证码已发送至邮箱: {}", maskEmail(normalized));
    }

    /**
     * 校验验证码
     * @param email
     * @param code
     */
    @Override
    public void verifyRegisterCode(String email, String code) {
        String normalized = normalizeEmail(email);
        assertValidEmail(normalized);
        if (!StringUtils.hasText(code)) {
            throw new BaseException(MessageEnum.EMAIL_CODE_INVALID);
        }

        String key = CODE_KEY_PREFIX + normalized;
        String stored = stringRedisTemplate.opsForValue().get(key);
        if (!StringUtils.hasText(stored)) {
            throw new BaseException(MessageEnum.EMAIL_CODE_EXPIRED);
        }
        if (!stored.equals(code.trim())) {
            throw new BaseException(MessageEnum.EMAIL_CODE_INVALID);
        }
        stringRedisTemplate.delete(key);
    }

    private void sendMail(String to, String code) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(mailFrom);
            helper.setTo(to);
            helper.setSubject("【智源灵探】注册验证码");

            helper.setText(buildHtmlContent(code), true);

            mailSender.send(message);
        } catch (Exception e) {
            log.error("邮件发送失败, to={}", maskEmail(to), e);
            throw new BaseException(MessageEnum.EMAIL_SEND_FAILED);
        }
    }

    private static String buildHtmlContent(String code) {
        return """
                <!DOCTYPE html>
                <html lang="zh-CN">
                <head>
                  <meta charset="UTF-8"/>
                  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
                  <title>注册验证码</title>
                </head>
                <body style="margin:0;padding:0;background-color:#f0f4f8;font-family:'Segoe UI',PingFang SC,Microsoft YaHei,sans-serif;">
                  <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="background-color:#f0f4f8;padding:32px 16px;">
                    <tr>
                      <td align="center">
                        <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);">
                          <tr>
                            <td style="background:linear-gradient(135deg,#1e3a5f 0%%,#2563eb 100%%);padding:28px 32px;text-align:center;">
                              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;letter-spacing:1px;">智源灵探</h1>
                              <p style="margin:8px 0 0;color:#bfdbfe;font-size:13px;">邮箱验证码注册</p>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding:32px 32px 24px;">
                              <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">您好，</p>
                              <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">
                                您正在注册 <strong style="color:#1e40af;"> 【智源灵探】智能能源管理系统</strong>，请使用以下验证码完成注册：
                              </p>
                              <table role="presentation" width="100%%" cellspacing="0" cellpadding="0">
                                <tr>
                                  <td align="center" style="background:#f8fafc;border:1px dashed #cbd5e1;border-radius:8px;padding:20px;">
                                    <span style="font-size:32px;font-weight:700;letter-spacing:8px;color:#1d4ed8;">%s</span>
                                  </td>
                                </tr>
                              </table>
                              <p style="margin:24px 0 0;color:#64748b;font-size:13px;line-height:1.6;">
                                验证码 <strong>5 分钟</strong> 内有效，请勿向他人泄露。
                              </p>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding:0 32px 28px;">
                              <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.5;">
                                如非本人操作，请忽略本邮件，您的账号不会因此受到影响。
                              </p>
                            </td>
                          </tr>
                          <tr>
                            <td style="background:#f8fafc;padding:16px 32px;text-align:center;border-top:1px solid #e2e8f0;">
                              <p style="margin:0;color:#94a3b8;font-size:11px;">本邮件由系统自动发送，请勿直接回复</p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </body>
                </html>
                """.formatted(code);
    }

    private static String normalizeEmail(String email) {
        return email == null ? "" : email.trim().toLowerCase();
    }

    private static void assertValidEmail(String email) {
        if (!StringUtils.hasText(email) || !EMAIL_PATTERN.matcher(email).matches()) {
            throw new BaseException(MessageEnum.EMAIL_INVALID);
        }
    }

    private static String maskEmail(String email) {
        int at = email.indexOf('@');
        if (at <= 1) {
            return "***";
        }
        return email.charAt(0) + "***" + email.substring(at);
    }
}
