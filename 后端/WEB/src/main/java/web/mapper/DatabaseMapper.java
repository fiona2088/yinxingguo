package web.mapper;

import org.apache.ibatis.annotations.*;
import web.entity.DatabaseEntity;

import java.util.List;

@Mapper
public interface DatabaseMapper {
    /**
     * 执行语句
     * @param sql
     */
    @Update("${sql}")
    void executeSql(String sql);

    /**
     * 查找
     * @param tableName
     * @return
     */
    @Select("SELECT * FROM ${tableName}")
    List<DatabaseEntity> selectAll(String tableName);

    /**
     * 分页查看目录
     * @return
     */
    @Select("select * from `database` where username = #{userName}")
    List<DatabaseEntity> findAllDatabase(String userName);

    /**
     * 查找目录
     * @param name
     * @return
     */
    @Select("select id from `database` where name = #{name} AND username = #{userName}")
    Long findDatabaseByName(String name, String userName);

    /**
     * 插入到目录
     * @param databaseEntity
     */
    @Insert("insert into `database` (username,name, create_time, update_time, `desc`)" +
            " VALUE " +
            " (#{userName}, #{name}, #{createTime}, #{updateTime}, #{desc})")
    void insertDatabase(DatabaseEntity databaseEntity);

    /**
     * 删除目录中的数据库
     * @param name
     */
    @Delete("delete from `database` where name = #{name} AND username = #{userName}")
    void deleteDatabase(String name, String userName);

    /**
     * 删除表
     * @param name
     */
    @Update("DROP TABLE IF EXISTS `${name}`")
    void dropTable(String name);
}
