package web.service.impl;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import web.dto.RegisterDTO;
import web.dto.UserDTO;
import web.entity.SessionEntity;
import web.entity.UserEntity;
import web.enumeration.MessageEnum;
import web.exception.BaseException;
import web.mapper.SessionMapper;
import web.mapper.UserMapper;
import web.service.EmailVerificationService;
import web.service.UserService;
import web.utils.JwtUtil;
import web.vo.LoginVO;

import java.time.LocalDateTime;

@Service
public class UserServiceImpl implements UserService {

    @Autowired
    private UserMapper userMapper;

    @Autowired
    private SessionMapper sessionMapper;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private JwtUtil jwtUtil;

    @Autowired
    private EmailVerificationService emailVerificationService;

    /**
     * 发送验证码
     * @param email
     */
    @Override
    public void sendRegisterCode(String email) {
        String normalized = email == null ? "" : email.trim().toLowerCase();
        if (userMapper.findUserByEmail(normalized) != null) {
            throw new BaseException(MessageEnum.EMAIL_ALREADY_REGISTERED);
        }
        emailVerificationService.sendRegisterCode(normalized);
    }

    /**
     * 验证码注册
     * @param registerDTO
     */
    @Override
    public void registerWithEmailCode(RegisterDTO registerDTO) {
        if (!StringUtils.hasText(registerDTO.getUserName())
                || !StringUtils.hasText(registerDTO.getPassword())
                || !StringUtils.hasText(registerDTO.getEmail())
                || !StringUtils.hasText(registerDTO.getVerificationCode())) {
            throw new BaseException(MessageEnum.IS_EMPTY);
        }

        String email = registerDTO.getEmail().trim().toLowerCase();
        emailVerificationService.verifyRegisterCode(email, registerDTO.getVerificationCode());

        if (userMapper.findUserByName(registerDTO.getUserName()) != null) {
            throw new BaseException(MessageEnum.USER_ALREADY_EXISTS);
        }
        if (userMapper.findUserByEmail(email) != null) {
            throw new BaseException(MessageEnum.EMAIL_ALREADY_REGISTERED);
        }

        sessionMapper.insert(SessionEntity.builder()
                .userName(registerDTO.getUserName())
                .createTime(LocalDateTime.now())
                .updateTime(LocalDateTime.now())
                .build());

        UserEntity user = UserEntity.builder()
                .userName(registerDTO.getUserName())
                .password(passwordEncoder.encode(registerDTO.getPassword()))
                .email(email)
                .build();
        userMapper.insertUser(user);
    }

    /**
     * 登录
     * @param userDTO
     * @return
     */
    @Override
    public LoginVO login(UserDTO userDTO) {
        if (!StringUtils.hasText(userDTO.getUserName()) || !StringUtils.hasText(userDTO.getPassword())) {
            throw new BaseException(MessageEnum.IS_EMPTY);
        }

        UserEntity user = userMapper.findUserByName(userDTO.getUserName());
        if (user == null) {
            throw new BaseException(MessageEnum.ACCOUNT_NOT_FOUND);
        }
        if (!verifyPassword(userDTO.getPassword(), user)) {
            throw new BaseException(MessageEnum.PASSWORD_ERROR);
        }

        sessionMapper.update(SessionEntity.builder()
                .userName(userDTO.getUserName())
                .updateTime(LocalDateTime.now())
                .build());

        String tableName = sessionMapper.selectTableName(userDTO.getUserName());
        return LoginVO.builder()
                .token(jwtUtil.generateToken(userDTO.getUserName()))
                .userName(userDTO.getUserName())
                .tableName(tableName)
                .build();
    }

    /**
     * 校验密码
     * @param rawPassword
     * @param user
     * @return
     */
    private boolean verifyPassword(String rawPassword, UserEntity user) {
        String stored = user.getPassword();
        if (passwordEncoder.matches(rawPassword, stored)) {
            return true;
        }
        if (stored != null && stored.equals(rawPassword)) {
            userMapper.updatePassword(user.getUserName(), passwordEncoder.encode(rawPassword));
            return true;
        }
        return false;
    }
}
