package web.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import org.springframework.stereotype.Service;
import web.dto.PredictRequestDTO;
import web.vo.DataVO;
import web.vo.PredictResponseVO;

@Service
public interface DataService {

    /**
     * 查找所有
     *
     * @param tableName
     * @return
     */
    DataVO searchAllData(String tableName);

    /**
     * 根据表头查找
     *
     * @param tableName
     * @param columnName
     * @return
     */
    DataVO searchByColumnName(String tableName, String columnName);

    /**
     * 查看表头
     * `     * @return
     */
    DataVO cheakColumnNames();

    /**
     * 精准查询
     *
     * @param buildingName
     * @param beginDatetime
     * @param endDatetime
     * @return
     */
    DataVO searchByCondition(String buildingName, String columnName, String beginDatetime, String endDatetime);

    /**
     * 查询当日总能耗
     *
     * @param date
     * @return
     */
    DataVO searchTodayEnergy(String date);

    /**
     * 查找类型总能耗
     *
     * @param date
     * @return
     */
    DataVO totalByType(String date);

    /**
     * 对比
     *
     * @param date
     * @param type
     * @param columnName
     * @return
     */
    DataVO contrast(String date, String type, String columnName);

    /**
     * predict
     * @param predictRequestDTO
     * @return
     */
    PredictResponseVO predict(PredictRequestDTO predictRequestDTO) throws JsonProcessingException;
}