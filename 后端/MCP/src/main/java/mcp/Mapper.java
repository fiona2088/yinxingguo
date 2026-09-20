package mcp;

import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

@org.apache.ibatis.annotations.Mapper
public interface Mapper {

    /**
     * 查找当前操作表格
     * @param userName
     * @return
     */
    @Select("select table_name from a08.session where user_name = #{userName}")
    String searchTableName(String userName);

    /**
     * 查询所有
     * @param tableName
     * @return
     */
    @Select("select * from ${tableName}")
    List<Map<String, Object>> searchAllData(String tableName);

    /**
     * 根据表头查询
     * @param tableName
     * @param columnName
     * @return
     */
    @Select("select ${columnName} from ${tableName}")
    List<Map<String, Object>> searchByColumnName(String tableName, String columnName);

    /**
     * 查看表头
     * @param tableName
     * @return
     */
    @Select("select column_name from information_schema.COLUMNS " +
            "where TABLE_NAME = #{tableName} " +
            "and TABLE_SCHEMA = database()")
    List<String> cheakColumnNames(String tableName);


    /**
     * 条件查询
     * @param tableName
     * @param buildingName
     * @param beginDatetime
     * @param endDatetime
     * @return
     */
    List<Map<String, Object>> searchByCondition(String columnName, String tableName ,String buildingName, String beginDatetime, String endDatetime);
}
