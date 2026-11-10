package com.novelle.infrastructure.html;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.safety.Safelist;
import org.springframework.stereotype.Component;

/**
 * Cleans chapter HTML before it is stored (data-dictionary: Chapter.Content, NFR-M6-02). Only the tags
 * {@code p, h2, h3, h4, br, em, strong, blockquote} survive, with no attribute at all, so scripts, event
 * handlers, links, images and inline styles are removed. Text of removed tags is kept.
 */
@Component
public class HtmlSanitizer {

    private static final Safelist SAFELIST = new Safelist()
            .addTags("p", "h2", "h3", "h4", "br", "em", "strong", "blockquote");

    private static final Document.OutputSettings OUTPUT = new Document.OutputSettings().prettyPrint(false);

    /** Returns the allowed subset of {@code html}; {@code null} becomes an empty string. */
    public String sanitize(String html) {
        if (html == null || html.isBlank()) {
            return "";
        }
        return Jsoup.clean(html, "", SAFELIST, OUTPUT).trim();
    }
}
