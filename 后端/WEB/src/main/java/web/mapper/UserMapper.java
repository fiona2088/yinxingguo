package web.mapper;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;
import web.entity.UserEntity;

@Mapper
public interface UserMapper {
    /**
     * 查找用户
     * @param username
     * @return
     */
    @Select("select * from a08.user where username = #{username}")
    UserEntity findUserByName(String username);

    @Select("select * from a08.user where email = #{email}")
    UserEntity findUserByEmail(String email);

    /**
     * 插入用户
     * @param user
     */
    @Insert("insert into a08.user (username, password, email)" +
            " values (#{userName}, #{password}, #{email})")
    void insertUser(UserEntity user);

    @Update("update a08.user set password = #{password} where username = #{userName}")
    void updatePassword(String userName, String password);
}
