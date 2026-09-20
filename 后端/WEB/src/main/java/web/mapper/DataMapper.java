package web.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

@Mapper
public interface DataMapper {

    @Select("select * from ${tableName}")
    List<Map<String, Object>> searchAllData(@Param("tableName") String tableName);

    @Select("select ${columnName} from ${tableName}")
    List<Map<String, Object>> searchByColumnName(@Param("tableName") String tableName,
                                                 @Param("columnName") String columnName);

    @Select("select column_name from information_schema.COLUMNS " +
            "where TABLE_NAME = #{tableName} and TABLE_SCHEMA = database() " +
            "and column_name <> 'id' order by ORDINAL_POSITION")
    List<String> cheakColumnNames(@Param("tableName") String tableName);

    @Select("select ${energyColumn} from ${tableName} " +
            "where ${timeColumn} >= #{beginDatetime} and ${timeColumn} <= #{endDatetime}")
    List<Map<String, Object>> searchTodayEnergy(@Param("tableName") String tableName,
                                                @Param("timeColumn") String timeColumn,
                                                @Param("energyColumn") String energyColumn,
                                                @Param("beginDatetime") String beginDatetime,
                                                @Param("endDatetime") String endDatetime);

    List<Map<String, Object>> searchByCondition(@Param("tableName") String tableName,
                                                @Param("buildingName") String buildingName,
                                                @Param("columnName") String columnName,
                                                @Param("beginDatetime") String beginDatetime,
                                                @Param("endDatetime") String endDatetime);

    @Select("select ${energyColumn} from ${tableName} " +
            "where ${buildingTypeColumn} = #{buildingType} " +
            "and ${timeColumn} >= #{beginTime} and ${timeColumn} <= #{endTime}")
    List<Float> totalByType(@Param("tableName") String tableName,
                            @Param("timeColumn") String timeColumn,
                            @Param("energyColumn") String energyColumn,
                            @Param("buildingTypeColumn") String buildingTypeColumn,
                            @Param("beginTime") String beginTime,
                            @Param("endTime") String endTime,
                            @Param("buildingType") String buildingType);

    @Select("select ${valueColumn}, ${buildingTypeColumn} from ${tableName} " +
            "where ${buildingTypeColumn} = #{buildingType} " +
            "and ${timeColumn} >= #{beginTime} and ${timeColumn} <= #{endTime}")
    List<Map<String, Object>> contrast(@Param("tableName") String tableName,
                                       @Param("timeColumn") String timeColumn,
                                       @Param("buildingTypeColumn") String buildingTypeColumn,
                                       @Param("valueColumn") String valueColumn,
                                       @Param("beginTime") String beginTime,
                                       @Param("endTime") String endTime,
                                       @Param("buildingType") String buildingType);
}
