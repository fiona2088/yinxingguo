package web.service;

import web.dto.UserDTO;
import web.vo.LoginVO;

public interface UserService {

    void sendRegisterCode(String email);

    void registerWithEmailCode(web.dto.RegisterDTO registerDTO);

    LoginVO login(UserDTO userDTO);
}
