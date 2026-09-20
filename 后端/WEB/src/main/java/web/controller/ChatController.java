package web.controller;

import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.client.advisor.MessageChatMemoryAdvisor;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import web.chat.ChatConversationIds;
import web.config.AppProperties;
import web.dto.ChatDTO;
import web.dto.Result;
import web.enumeration.MessageEnum;
import web.exception.BaseException;
import web.service.ChatService;
import web.utils.TableNameHelper;
import web.vo.DataVO;

import java.io.*;
import java.net.URLEncoder;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping
@Slf4j
public class ChatController {

    @Autowired
    private ChatService chatService;

    @Autowired
    private AppProperties appProperties;

    private final ChatClient chatClient;
    private final ChatMemory chatMemory;
    private final WebClient webClient;

    public ChatController(ChatClient.Builder builder, ChatMemory chatMemory) {
        this.chatClient = builder.build();
        this.chatMemory = chatMemory;
        this.webClient = WebClient.builder().build();
    }

    /**
     * @param message   用户问题
     * @param sessionId 可选，同一用户多开对话窗口时传不同值，避免串话
     */
    @PostMapping("/ai/chat")
    public Result chat(@RequestParam String message,
                       @RequestParam(required = false) String sessionId) {
        String conversationId = ChatConversationIds.resolve(sessionId);
        log.info("用户提问 conversationId={}: {}", conversationId, message);

        var memoryAdvisor = MessageChatMemoryAdvisor.builder(chatMemory)
                .conversationId(conversationId)
                .build();

        String fullContent = chatClient.prompt()
                .advisors(memoryAdvisor)
                .user(buildChatPrompt(message))
                .call()
                .content();

        log.info("AI 回复 conversationId={}: {}", conversationId, fullContent);

        int marker = fullContent.lastIndexOf("@");
        if (marker >= 0) {
            fullContent = fullContent.substring(marker + 1);
        }
        List<Map<String, Object>> list = new ArrayList<>();
        list.add(Map.of("content", fullContent));

        return Result.ok("请求成功", DataVO.builder().datas(list).build());
    }

    /** 清空当前用户（或指定 session）的对话记忆 */
    @DeleteMapping("/ai/chat/history")
    public Result clearHistory(@RequestParam(required = false) String sessionId) {
        String conversationId = ChatConversationIds.resolve(sessionId);
        chatMemory.clear(conversationId);
        log.info("已清空对话记忆 conversationId={}", conversationId);
        return Result.ok("对话已重置");
    }

    private String buildChatPrompt(String message) {
        String table = TableNameHelper.requireCurrentTable();
        return "当前操作表为" + table
                + "，千万不要在正式回答中提及表名！调用 MCP 工具时 tableName 必须使用该表名。以下是真正的用户提问："
                + message;
    }

    @PostMapping(value = "rag-proxy/v1/chat/completions", produces = MediaType.APPLICATION_JSON_VALUE)
    public Mono<String> proxy(@RequestBody Map<String, Object> body,
                              @RequestHeader("Authorization") String auth) {
        body.put("stream", false);
        String ragUrl = appProperties.getRag().getChatCompletionsUrl();
        log.info("同步连接 RAG 接口: {}", ragUrl);

        return webClient.post()
                .uri(ragUrl)
                .header("Authorization", auth)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body)
                .retrieve()
                .bodyToMono(String.class)
                .timeout(Duration.ofSeconds(120))
                .doOnError(e -> log.error("RAG 接口调用失败", e));
    }

    @PostMapping("/ai/export")
    public String export(@RequestBody ChatDTO chatDTO) {
        if (chatDTO == null || chatDTO.getData() == null || chatDTO.getData().isEmpty()) {
            throw new BaseException(MessageEnum.CANT_BE_EMPTY);
        }
        if (!StringUtils.hasText(chatDTO.getExcelName())) {
            throw new BaseException(MessageEnum.CANT_BE_EMPTY);
        }

        chatService.prepareReportData(chatDTO.getData(), chatDTO.getExcelName());
        String downloadUrl = appProperties.excelDownloadUrl(chatDTO.getExcelName());
        log.info("导出表格成功，链接为: {}", downloadUrl);
        return downloadUrl;
    }

    @GetMapping("/excel/download/{excelName}")
    public void download(@PathVariable String excelName, HttpServletResponse response) throws IOException {
        if (!chatService.hasReportData(excelName)) {
            response.setStatus(HttpServletResponse.SC_NOT_FOUND);
            response.setCharacterEncoding("utf-8");
            response.getWriter().write("报表数据还在生成中，请稍后再试或重新生成");
            return;
        }

        response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        response.setCharacterEncoding("utf-8");
        response.setHeader("Content-disposition", "attachment;filename=" + excelName + ".xlsx");
        chatService.createExcel(excelName, response.getOutputStream());
    }

    @GetMapping("/excel/download/2024-01-E_total")
    public void downloadLegacySample(HttpServletResponse response) throws IOException {
        String dir = appProperties.getExcel().getLegacySampleDir();
        if (!StringUtils.hasText(dir)) {
            response.setStatus(HttpServletResponse.SC_NOT_FOUND);
            response.setContentType("text/plain;charset=utf-8");
            response.getWriter().write("未配置 EXCEL_LEGACY_SAMPLE_DIR");
            return;
        }

        String fileName = appProperties.getExcel().getLegacySampleFileName() + ".xlsx";
        Path filePath = Path.of(dir, fileName);
        File file = filePath.toFile();

        if (!file.exists() || !file.isFile()) {
            response.setStatus(HttpServletResponse.SC_NOT_FOUND);
            response.setContentType("text/plain;charset=utf-8");
            response.getWriter().write("文件不存在: " + filePath);
            return;
        }

        response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        response.setCharacterEncoding("utf-8");
        String encodedFileName = URLEncoder.encode(file.getName(), "UTF-8").replaceAll("\\+", "%20");
        response.setHeader("Content-Disposition",
                "attachment; filename=\"" + encodedFileName + "\"; filename*=utf-8''" + encodedFileName);
        response.setContentLengthLong(file.length());

        try (InputStream in = new BufferedInputStream(new FileInputStream(file));
             OutputStream out = response.getOutputStream()) {
            byte[] buffer = new byte[8192];
            int len;
            while ((len = in.read(buffer)) != -1) {
                out.write(buffer, 0, len);
            }
            out.flush();
        }
    }
}
