package com.novelle.infrastructure.html;

import org.jsoup.Jsoup;
import org.springframework.stereotype.Component;

/**
 * Counts the words of chapter HTML (data-dictionary: Chapter.WordCount is computed by the application).
 * Tags are stripped first (block tags and {@code br} separate words); a word is a run of characters that are
 * neither whitespace nor Unicode space separators, so {@code &nbsp;} also separates words.
 */
@Component
public class WordCounter {

    public int count(String html) {
        if (html == null || html.isBlank()) {
            return 0;
        }
        String text = Jsoup.parseBodyFragment(html).body().text();
        int words = 0;
        boolean inWord = false;
        for (int i = 0; i < text.length(); ) {
            int cp = text.codePointAt(i);
            boolean space = Character.isWhitespace(cp) || Character.isSpaceChar(cp);
            if (space) {
                inWord = false;
            } else if (!inWord) {
                inWord = true;
                words++;
            }
            i += Character.charCount(cp);
        }
        return words;
    }
}
