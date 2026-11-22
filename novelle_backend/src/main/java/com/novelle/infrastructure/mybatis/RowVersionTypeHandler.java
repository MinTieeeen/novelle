package com.novelle.infrastructure.mybatis;

import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.apache.ibatis.type.MappedTypes;

/**
 * Maps {@code ROWVERSION} (BINARY(8)) to {@link RowVersion}. Registered for the Java type through
 * {@code mybatis.type-handlers-package}, so model fields and {@code #{rowVersion}} parameters of type
 * RowVersion need no extra attribute in the XML mappers.
 */
@MappedTypes(RowVersion.class)
public class RowVersionTypeHandler extends BaseTypeHandler<RowVersion> {

    @Override
    public void setNonNullParameter(PreparedStatement ps, int i, RowVersion parameter, JdbcType jdbcType)
            throws SQLException {
        ps.setBytes(i, parameter.toBytes());
    }

    @Override
    public RowVersion getNullableResult(ResultSet rs, String columnName) throws SQLException {
        return toRowVersion(rs.getBytes(columnName));
    }

    @Override
    public RowVersion getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
        return toRowVersion(rs.getBytes(columnIndex));
    }

    @Override
    public RowVersion getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
        return toRowVersion(cs.getBytes(columnIndex));
    }

    private static RowVersion toRowVersion(byte[] bytes) {
        return bytes == null ? null : new RowVersion(bytes);
    }
}
