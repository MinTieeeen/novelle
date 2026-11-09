package com.novelle.dto;

import java.time.Instant;
import java.util.List;

import com.novelle.model.FollowerRow;
import com.novelle.model.FollowerSummary;
import com.novelle.model.StoryFollowRow;

/** Dashboard followers (D4): totals, the newest followers of the author and the most followed stories. */
public record FollowersResponse(
        int followerCount,
        int newFollowers30d,
        List<Follower> recent,
        List<TopStory> topStories) {

    public record Follower(int userId, String username, String displayName, String avatarUrl, Instant followedAt) {

        static Follower from(FollowerRow f) {
            return new Follower(f.getUserId(), f.getUsername(), f.getDisplayName(), f.getAvatarUrl(),
                    Times.utc(f.getFollowedAt()));
        }
    }

    public record TopStory(int storyId, String title, String slug, int followCount) {

        static TopStory from(StoryFollowRow s) {
            return new TopStory(s.getStoryId(), s.getTitle(), s.getSlug(), s.getFollowCount());
        }
    }

    public static FollowersResponse from(FollowerSummary summary, List<FollowerRow> recent,
                                         List<StoryFollowRow> topStories) {
        return new FollowersResponse(summary.getFollowerCount(), summary.getNewFollowers(),
                recent.stream().map(Follower::from).toList(), topStories.stream().map(TopStory::from).toList());
    }
}
