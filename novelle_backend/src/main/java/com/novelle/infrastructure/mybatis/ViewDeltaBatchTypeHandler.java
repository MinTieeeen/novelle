package com.novelle.infrastructure.mybatis;

import java.sql.CallableStatement;
import java.sql.Date;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;

import com.microsoft.sqlserver.jdbc.SQLServerDataTable;
import com.microsoft.sqlserver.jdbc.SQLServerPreparedStatement;
import com.novelle.model.ViewDelta;
import com.novelle.model.ViewDeltaBatch;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.apache.ibatis.type.MappedTypes;

/**
 * Sends a {@link ViewDeltaBatch} as the table-valued parameter {@code dbo.ViewDeltaTable} of
 * {@code sp_FlushViews}. Registered for that Java type through {@code mybatis.type-handlers-package}.
 * <p>
 * The statement handed over by MyBatis is a HikariCP proxy, so the driver statement is reached with
 * {@code unwrap}; {@code SQLServerCallableStatement} extends {@code SQLServerPreparedStatement}, so this also
 * works for {@code {call …}}. Write-only: the procedure returns nothing.
 */
@MappedTypes(ViewDeltaBatch.class)
public class ViewDeltaBatchTypeHandler extends BaseTypeHandler<ViewDeltaBatch> {

    /** Name of the table type in SQL Server (05_procedures.sql). */
    public static final String TABLE_TYPE = "dbo.ViewDeltaTable";

    @Override
    public void setNonNullParameter(PreparedStatement ps, int i, ViewDeltaBatch parameter, JdbcType jdbcType)
            throws SQLException {
        ps.unwrap(SQLServerPreparedStatement.class).setStructured(i, TABLE_TYPE, toDataTable(parameter));
    }

    /** Columns in the order and with the types of {@code dbo.ViewDeltaTable}. */
    public static SQLServerDataTable toDataTable(ViewDeltaBatch batch) throws SQLException {
        SQLServerDataTable table = new SQLServerDataTable();
        table.addColumnMetadata("TargetType", Types.CHAR);
        table.addColumnMetadata("TargetId", Types.BIGINT);
        table.addColumnMetadata("ViewDate", Types.DATE);
        table.addColumnMetadata("Delta", Types.INTEGER);
        for (ViewDelta d : batch.deltas()) {
            table.addRow(String.valueOf(d.targetType()), d.targetId(), Date.valueOf(d.viewDate()), d.delta());
        }
        return table;
    }

    @Override
    public ViewDeltaBatch getNullableResult(ResultSet rs, String columnName) {
        throw new UnsupportedOperationException("ViewDeltaBatch is a parameter type only");
    }

    @Override
    public ViewDeltaBatch getNullableResult(ResultSet rs, int columnIndex) {
        throw new UnsupportedOperationException("ViewDeltaBatch is a parameter type only");
    }

    @Override
    public ViewDeltaBatch getNullableResult(CallableStatement cs, int columnIndex) {
        throw new UnsupportedOperationException("ViewDeltaBatch is a parameter type only");
    }
}
