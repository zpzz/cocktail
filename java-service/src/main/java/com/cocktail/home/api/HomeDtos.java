package com.cocktail.home.api;

import java.util.List;

public final class HomeDtos {

    private HomeDtos() {
    }

    public record QuickEntry(
            String key,
            String title,
            String sub,
            String iconUrl,
            boolean muted,
            String action
    ) {
    }

    public record QuickEntriesResponse(List<QuickEntry> items) {
    }
}
