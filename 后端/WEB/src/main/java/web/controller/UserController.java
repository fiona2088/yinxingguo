package web.controller;


import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import web.dto.RegisterDTO;
import web.dto.Result;
import web.dto.UserDTO;
import web.enumeration.MessageEnum;
import web.exception.BaseException;
import web.service.UserService;
import web.vo.LoginVO;

@Slf4j
@RestController
@RequestMapping("/admin")
public class UserController {

    @Autowired
    private UserService userService;

    /**
     * 发送注册验证码到邮箱（QQ 邮箱等，需已配置 spring.mail）
     */
    @PostMapping("/email/send-code")
    public Result sendRegisterCode(@RequestParam String email) {
        if (!StringUtils.hasText(email)) {
            throw new BaseException(MessageEnum.IS_EMPTY);
        }
        log.info("请求发送注册验证码: {}", email);
        userService.sendRegisterCode(email);
        return Result.ok("验证码已发送，请查收邮件（5 分钟内有效）");
    }

    /**
     * 邮箱验证码注册（需先调用 /admin/email/send-code）
     */
    @PostMapping("/register")
    public Result register(@RequestBody RegisterDTO registerDTO) {
        if (!StringUtils.hasText(registerDTO.getUserName())
                || !StringUtils.hasText(registerDTO.getPassword())
                || !StringUtils.hasText(registerDTO.getEmail())
                || !StringUtils.hasText(registerDTO.getVerificationCode())) {
            throw new BaseException(MessageEnum.IS_EMPTY);
        }

        log.info("邮箱验证码注册: user={}, email={}",
                registerDTO.getUserName(), registerDTO.getEmail());
        userService.registerWithEmailCode(registerDTO);
        return Result.ok("注册成功");
    }

    @PostMapping("/login")
    public Result login(@RequestBody UserDTO userDTO) {
        log.info("正在登录: {}", userDTO.getUserName());
        LoginVO loginVO = userService.login(userDTO);
        return Result.ok("登录成功", loginVO);
    }
}
