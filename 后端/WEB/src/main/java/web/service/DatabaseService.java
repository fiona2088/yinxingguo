package web.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import web.dto.DatabaseDTO;
import web.dto.Result;

@Service
public interface DatabaseService {
    /**
     * 导入数据库
     * @param file
     * @param databaseDTO
     * @return
     */
    void upload(MultipartFile file, DatabaseDTO databaseDTO) throws Exception;

    /**
     * 查看数据库
     * @param pageSize
     */
    Result check(Integer pageNum, Integer pageSize) throws JsonProcessingException;

    /**
     * 删除数据库
     * @param name
     * @return
     */
    void delete(String name);

    /**
     * 选择数据库
     * @param name
     */
    void select(String name);
}
