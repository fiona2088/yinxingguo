package web.utils;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Component;
import web.config.AppProperties;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

@Component
public class JwtUtil {

    private final AppProperties appProperties;

    public JwtUtil(AppProperties appProperties) {
        this.appProperties = appProperties;
    }

    public String generateToken(String username) {
        long hours = appProperties.getJwt().getExpirationHours();
        Date now = new Date();
        return Jwts.builder()
                .subject(username)
                .issuedAt(now)
                .expiration(new Date(now.getTime() + hours * 3600_000L))
                .signWith(signingKey())
                .compact();
    }

    public String parseUsername(String token) {
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(signingKey())
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
            return claims.getSubject();
        } catch (ExpiredJwtException e) {
            throw new JwtException("token expired");
        }
    }

    private SecretKey signingKey() {
        return Keys.hmacShaKeyFor(
                appProperties.getJwt().getSecret().getBytes(StandardCharsets.UTF_8));
    }
}
