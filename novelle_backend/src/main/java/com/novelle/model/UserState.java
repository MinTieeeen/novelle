package com.novelle.model;

/** Role and Status of a user, re-read on every authenticated request by UserStatusFilter. */
public class UserState {

    private int userId;
    private String role;
    private String status;
    private String banReason;

    public int getUserId() { return userId; }
    public void setUserId(int userId) { this.userId = userId; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getBanReason() { return banReason; }
    public void setBanReason(String banReason) { this.banReason = banReason; }

    public boolean isBanned() { return "BANNED".equals(status); }
}
