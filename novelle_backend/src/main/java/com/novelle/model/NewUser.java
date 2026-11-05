package com.novelle.model;

/** Row inserted by registration; {@code userId} is filled with the generated identity after the insert. */
public class NewUser {

    private Integer userId;
    private final String username;
    private final String email;
    private final String passwordHash;
    private final String displayName;

    public NewUser(String username, String email, String passwordHash, String displayName) {
        this.username = username;
        this.email = email;
        this.passwordHash = passwordHash;
        this.displayName = displayName;
    }

    public Integer getUserId() { return userId; }
    public void setUserId(Integer userId) { this.userId = userId; }

    public String getUsername() { return username; }
    public String getEmail() { return email; }
    public String getPasswordHash() { return passwordHash; }
    public String getDisplayName() { return displayName; }
}
