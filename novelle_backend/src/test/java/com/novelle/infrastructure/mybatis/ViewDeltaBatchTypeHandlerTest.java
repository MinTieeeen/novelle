package com.novelle.infrastructure.mybatis;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Types;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

import com.microsoft.sqlserver.jdbc.SQLServerDataColumn;
import com.microsoft.sqlserver.jdbc.SQLServerDataTable;
import com.novelle.model.ViewDelta;
import com.novelle.model.ViewDeltaBatch;
import org.junit.jupiter.api.Test;

/** The data table must match dbo.ViewDeltaTable (05_procedures.sql): column order and types. */
class ViewDeltaBatchTypeHandlerTest {

    @Test
    void columnsMatchTheTableType() throws Exception {
        SQLServerDataTable table = ViewDeltaBatchTypeHandler.toDataTable(new ViewDeltaBatch(List.of()));

        Map<Integer, SQLServerDataColumn> columns = table.getColumnMetadata();
        assertThat(columns).hasSize(4);
        assertThat(columns.get(0).getColumnName()).isEqualTo("TargetType");
        assertThat(columns.get(0).getColumnType()).isEqualTo(Types.CHAR);
        assertThat(columns.get(1).getColumnName()).isEqualTo("TargetId");
        assertThat(columns.get(1).getColumnType()).isEqualTo(Types.BIGINT);
        assertThat(columns.get(2).getColumnName()).isEqualTo("ViewDate");
        assertThat(columns.get(2).getColumnType()).isEqualTo(Types.DATE);
        assertThat(columns.get(3).getColumnName()).isEqualTo("Delta");
        assertThat(columns.get(3).getColumnType()).isEqualTo(Types.INTEGER);
    }

    @Test
    void oneRowPerDelta() throws Exception {
        LocalDate day = LocalDate.of(2026, 11, 8);
        SQLServerDataTable table = ViewDeltaBatchTypeHandler.toDataTable(new ViewDeltaBatch(List.of(
                new ViewDelta('S', 1, day, 3), new ViewDelta('C', 2, day, 5))));

        List<Object[]> rows = new ArrayList<>();
        Iterator<Map.Entry<Integer, Object[]>> it = table.getIterator();
        it.forEachRemaining(e -> rows.add(e.getValue()));

        // the driver accepts java.sql.Date for a DATE column and stores it as its ISO text
        assertThat(rows).hasSize(2);
        assertThat(rows.get(0)).containsExactly("S", 1L, "2026-11-08", 3);
        assertThat(rows.get(1)).containsExactly("C", 2L, "2026-11-08", 5);
    }
}
