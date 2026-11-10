package com.novelle.service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import com.novelle.dto.AdminUserDetailResponse;
import com.novelle.dto.AdminUserItemResponse;
import com.novelle.dto.AuthorVerifyResponse;
import com.novelle.dto.CreateAdminRequest;
import com.novelle.dto.PageResponse;
import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import com.novelle.infrastructure.cache.CacheKeys;
import com.novelle.infrastructure.cache.CacheService;
import com.novelle.infrastructure.views.ViewProperties;
import com.novelle.mapper.AdminUserMapper;
import com.novelle.mapper.AuthMapper;
import com.novelle.mapper.StudioStoryMapper;
import com.novelle.model.AdminUser;
import com.novelle.model.AdminUserCriteria;
import com.novelle.model.NewUser;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * User management of the administrators (F11, docs/module-admin.md U1–U6).
 * <ul>
 *   <li>Ban / unban are one UPDATE each with the state precondition in the WHERE (D7); when it changes nothing the
 *       row is read again to answer 404 / 403 / 409.</li>
 *   <li>Administrators can never be banned (D1), so RB16 always holds.</li>
 *   <li>The session of a banned user dies at its next request through UserStatusFilter (RB12); nothing to do here.</li>
 * </ul>
 */
@Service
public class AdminUserService {

    static final int MIN_QUERY = 2;
    static final int MAX_QUERY = 100;

    private static final Set<String> ROLES = Set.of("READER", "AUTHOR", "ADMIN");
    private static final Set<String> STATUSES = Set.of("ACTIVE", "BANNED");

    private final AdminUserMapper userMapper;
    private final AuthMapper authMapper;
    private final StudioStoryMapper storyMapper;
    private final PasswordEncoder passwordEncoder;
    private final CacheService cache;
    private final ViewProperties views;

    public AdminUserService(AdminUserMapper userMapper, AuthMapper authMapper, StudioStoryMapper storyMapper,
                            PasswordEncoder passwordEncoder, CacheService cache, ViewProperties views) {
        this.userMapper = userMapper;
        this.authMapper = authMapper;
        this.storyMapper = storyMapper;
        this.passwordEncoder = passwordEncoder;
        this.cache = cache;
        this.views = views;
    }

    /* ---------- reading ---------- */

    /** U1. {@code from} / {@code to} are Vietnam calendar days, both inclusive. */
    @Transactional(readOnly = true)
    public PageResponse<AdminUserItemResponse> page(String role, String status, String q, LocalDate from,
                                                    LocalDate to, Integer page, Integer size) {
        PageQuery pq = PageQuery.of(page, size);
        if (from != null && to != null && from.isAfter(to)) {
            throw ApiException.invalidField("from", "must not be after to");
        }
        AdminUserCriteria c = new AdminUserCriteria(
                parseEnum("role", role, ROLES), parseEnum("status", status, STATUSES), likePattern(q),
                from == null ? null : startOfDayUtc(from), to == null ? null : startOfDayUtc(to.plusDays(1)));
        long total = userMapper.countUsers(c);
        List<AdminUserItemResponse> items = total == 0 ? List.of()
                : userMapper.pageUsers(c, pq.offset(), pq.size()).stream().map(AdminUserItemResponse::from).toList();
        return PageResponse.of(items, pq.page(), pq.size(), total);
    }

    /** U2. */
    @Transactional(readOnly = true)
    public AdminUserDetailResponse get(int userId) {
        return detail(require(userId));
    }

    /* ---------- writing ---------- */

    /** U3 (RB8, RB12, D1, D7). */
    @Transactional
    public AdminUserDetailResponse ban(int adminId, int userId, String reason) {
        if (userMapper.ban(userId, adminId, reason.strip()) == 0) {
            AdminUser now = require(userId);
            if ("ADMIN".equals(now.getRole())) {
                throw new ApiException(ErrorCode.CANNOT_BAN_ADMIN);
            }
            throw new ApiException(ErrorCode.ALREADY_PROCESSED, "The user is already banned.");
        }
        return detail(require(userId));
    }

    /** U4. */
    @Transactional
    public AdminUserDetailResponse unban(int userId) {
        if (userMapper.unban(userId) == 0) {
            require(userId);
            throw new ApiException(ErrorCode.ALREADY_PROCESSED, "The user is not banned.");
        }
        return detail(require(userId));
    }

    /** U5 (G2, D8): the registration checks, but Role = ADMIN and no login. */
    @Transactional
    public AdminUserDetailResponse createAdmin(CreateAdminRequest req) {
        PasswordRules.checkLength("password", req.password());
        String username = req.username();
        String email = req.email().trim().toLowerCase(Locale.ROOT);
        if (authMapper.existsUsername(username)) {
            throw new ApiException(ErrorCode.USERNAME_TAKEN);
        }
        if (authMapper.existsEmail(email)) {
            throw new ApiException(ErrorCode.EMAIL_TAKEN);
        }
        NewUser user = new NewUser(username, email, passwordEncoder.encode(req.password()), req.displayName().trim());
        try {
            userMapper.insertAdmin(user);
        } catch (DuplicateKeyException ex) {
            String message = String.valueOf(ex.getMostSpecificCause().getMessage());
            throw new ApiException(message.contains("UQ_User_Email") ? ErrorCode.EMAIL_TAKEN : ErrorCode.USERNAME_TAKEN);
        }
        return detail(require(user.getUserId()));
    }

    /**
     * U6. Idempotent; the verified badge is shown on the story pages and cards, so a change evicts the cache of
     * every story of the author and the home page.
     */
    @Transactional
    public AuthorVerifyResponse setVerified(int authorId, boolean isVerified) {
        Boolean current = userMapper.findVerified(authorId);
        if (current == null) {
            throw new ApiException(ErrorCode.AUTHOR_NOT_FOUND);
        }
        if (current != isVerified) {
            userMapper.setVerified(authorId, isVerified);
            List<String> keys = new ArrayList<>();
            for (int storyId : storyMapper.storyIdsOfAuthor(authorId)) {
                keys.add(CacheKeys.story(storyId));
            }
            keys.add(CacheKeys.HOME);
            cache.evict(keys.toArray(String[]::new));
        }
        return new AuthorVerifyResponse(authorId, isVerified);
    }

    /* ---------- helpers ---------- */

    private AdminUser require(int userId) {
        AdminUser user = userMapper.findUser(userId);
        if (user == null) {
            throw new ApiException(ErrorCode.USER_NOT_FOUND);
        }
        return user;
    }

    private AdminUserDetailResponse detail(AdminUser user) {
        return AdminUserDetailResponse.from(user, userMapper.countRequestsByStatus(user.getUserId()));
    }

    private LocalDateTime startOfDayUtc(LocalDate day) {
        return LocalDateTime.ofInstant(day.atStartOfDay(views.zone()).toInstant(), ZoneOffset.UTC);
    }

    static String parseEnum(String field, String value, Set<String> allowed) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String v = value.strip().toUpperCase(Locale.ROOT);
        if (!allowed.contains(v)) {
            throw ApiException.invalidField(field, "must be one of " + String.join(", ", allowed.stream().sorted().toList()));
        }
        return v;
    }

    /** {@code %q%} with the T-SQL LIKE wildcards of {@code q} escaped ({@code [}, {@code %}, {@code _}). */
    static String likePattern(String q) {
        if (q == null || q.isBlank()) {
            return null;
        }
        String s = q.strip();
        if (s.length() < MIN_QUERY || s.length() > MAX_QUERY) {
            throw ApiException.invalidField("q", "must have " + MIN_QUERY + "–" + MAX_QUERY + " characters");
        }
        return "%" + s.replace("[", "[[]").replace("%", "[%]").replace("_", "[_]") + "%";
    }
}
