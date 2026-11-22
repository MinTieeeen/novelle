package com.novelle.integration;

/**
 * Helpers for the admin tests (module M7). Writes happen through the API in the rolled-back test transaction;
 * {@code cache:stats:*} keys are under {@code cache:} and cleaned by ApiIntegrationTest before and after each test.
 */
abstract class AdminIntegrationSupport extends StudioIntegrationSupport {

    protected static final String ADMIN = "/api/admin";

    /** A logged-in ACTIVE administrator. */
    protected record Admin(Client client, int adminId) {
    }

    protected Admin admin() throws Exception {
        String username = seededActiveAdmin();
        return new Admin(loginAs(username), userId(username));
    }

    /** Another ACTIVE administrator than {@code notUserId}, or the same one when only one exists. */
    protected int otherAdminId(int notUserId) {
        return (int) count("""
                SELECT TOP (1) UserId FROM dbo.[User] WHERE Role = 'ADMIN' AND Status = 'ACTIVE'
                ORDER BY CASE WHEN UserId = ? THEN 1 ELSE 0 END, UserId""", notUserId);
    }
}
