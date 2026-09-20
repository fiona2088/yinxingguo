package web.utils;

import io.jsonwebtoken.JwtException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.AntPathMatcher;
import org.springframework.util.StringUtils;
import org.springframework.web.servlet.HandlerInterceptor;
import web.config.AppProperties;
import web.enumeration.MessageEnum;
import web.exception.BaseException;
import web.mapper.SessionMapper;

/**
 * 统一鉴权：优先 JWT（Header），兼容旧版 {@code ?userName=}（仅读查询参数，不读请求体，不影响 JSON）。
 */
@Slf4j
@Component
public class AuthInterceptor implements HandlerInterceptor {

    private static final String BEARER_PREFIX = "Bearer ";
    private static final String INTERNAL_API_KEY_HEADER = "X-Internal-Api-Key";

    private final AntPathMatcher pathMatcher = new AntPathMatcher();

    @Autowired
    private JwtUtil jwtUtil;

    @Autowired
    private SessionMapper sessionMapper;

    @Autowired
    private AppProperties appProperties;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (allowInternalServiceCall(request)) {
            return true;
        }

        String userName = resolveUserName(request);
        if (!StringUtils.hasText(userName)) {
            throw new BaseException(MessageEnum.UNAUTHORIZED);
        }

        String tableName = sessionMapper.selectTableName(userName);
        UserContext.setUserName(userName);
        UserContext.setTable(tableName);
        log.debug("已认证用户: {}, 当前表: {}", userName, tableName);
        return true;
    }

    /**
     * 1. {@code Authorization: Bearer <token>}（推荐）
     * 2. {@code ?userName=}（与旧前端兼容；POST + JSON 时 query 与 body 互不影响）
     */
    private String resolveUserName(HttpServletRequest request) {
        String token = resolveBearerToken(request);
        if (StringUtils.hasText(token)) {
            try {
                return jwtUtil.parseUsername(token);
            } catch (JwtException e) {
                log.warn("JWT 校验失败: {}", e.getMessage());
                throw new BaseException(MessageEnum.TOKEN_INVALID);
            }
        }
        return request.getParameter("userName");
    }

    /** MCP 等服务间调用 /ai/export，使用内部 API Key，不走用户 JWT。 */
    private boolean allowInternalServiceCall(HttpServletRequest request) {
        if (!pathMatcher.match("/ai/export", request.getRequestURI())) {
            return false;
        }
        String apiKey = request.getHeader(INTERNAL_API_KEY_HEADER);
        String expected = appProperties.getInternalApiKey();
        return StringUtils.hasText(expected) && expected.equals(apiKey);
    }

    private String resolveBearerToken(HttpServletRequest request) {
        String authorization = request.getHeader("Authorization");
        if (StringUtils.hasText(authorization) && authorization.startsWith(BEARER_PREFIX)) {
            return authorization.substring(BEARER_PREFIX.length()).trim();
        }
        return null;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response,
                                Object handler, Exception ex) {
        UserContext.clear();
    }
}
