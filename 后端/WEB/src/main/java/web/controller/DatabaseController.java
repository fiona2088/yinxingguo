package web.controller;

import com.fasterxml.jackson.core.JsonProcessingException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import web.dto.DatabaseDTO;
import web.dto.Result;
import web.enumeration.MessageEnum;
import web.exception.BaseException;
import web.service.DatabaseService;

@Slf4j
@RestController
@RequestMapping("/database")
public class DatabaseController {
    @Autowired
    private DatabaseService databaseService;

    /**
     * 导入数据库
     * @param file
     * @param databaseDTO
     * @return
     */
    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Result upload(@RequestParam("file") MultipartFile file, DatabaseDTO databaseDTO) throws Exception {
        log.info("上传文件中:{}", databaseDTO.getName());
        if (file.isEmpty()) {
            throw new BaseException(MessageEnum.CANT_BE_EMPTY);
        }

        String fileName = file.getOriginalFilename();
        if (fileName == null || !fileName.toLowerCase().endsWith(".csv")) {
            throw new BaseException(MessageEnum.FILE_ILLEGAL);
        }

        if (file.getSize() > 10 * 1024 * 1024) {
            throw new BaseException(MessageEnum.FILE_TOO_BIG);
        }
        databaseService.upload(file, databaseDTO);
        return Result.ok("上传成功");
    }

    /**
     * 分页查询
     * @param pageNum
     * @param pageSize
     * @return
     */
    @GetMapping("/check")
    public Result check(@RequestParam Integer pageNum, Integer pageSize) throws JsonProcessingException {
        log.info("查看数据库中");
        if (pageSize == null || pageSize <= 0) {
            throw new BaseException(MessageEnum.CANT_BE_EMPTY);
        }
        return databaseService.check(pageNum, pageSize);
    }

    /**
     * 删除数据库
     * @param name
     * @return
     */
    @DeleteMapping("/delete")
    public Result delete(@RequestParam String name){
        log.info("正在删除文件：{}", name);
        if (name == null) {
            throw new BaseException(MessageEnum.CANT_BE_EMPTY);
        }
        databaseService.delete(name);
        return Result.ok("删除成功");
    }

    /**
     * 选择数据库
     * @param name
     * @return
     */
    @GetMapping("/select")
    public Result select(@RequestParam String name){
        log.info("选择数据库：{}", name);
        if (name == null) {
            throw new BaseException(MessageEnum.CANT_BE_EMPTY);
        }
        databaseService.select(name);
        return Result.ok("切换成功");
    }
}
