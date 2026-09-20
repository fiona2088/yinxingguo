package web.mapper;

import org.apache.ibatis.annotations.*;
import web.entity.SessionEntity;

@Mapper
public interface SessionMapper {

    /**
     * 创建session
     * @param session
     */
    @Insert("insert into a08.session (user_name, table_name, create_time, update_time)" +
            " VALUE " +
            "(#{userName}, #{tableName}, #{createTime}, #{updateTime})")
    void insert(SessionEntity session);

    /**
     * 查找session
     * @param userName
     */
    @Select("SELECT table_name from a08.session where user_name = #{userName}")
    String selectTableName(String userName);

    /**
     * 更新session
     * @param session
     */
    @Update("update a08.session set table_name = #{tableName}, update_time = #{updateTime} " +
            "where user_name = #{userName}")
    void update(SessionEntity session);

    /**
     * 删除session
     * @param userName
     */
    @Delete("delete from a08.session where user_name = #{userName}")
    void delete(String userName);

}
