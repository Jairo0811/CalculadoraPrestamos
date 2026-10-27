using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LoanCalcRD.Infrastructure.Persistence.Migrations;

public partial class InitialCreate : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "loan_simulations",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                UserId = table.Column<Guid>(type: "uuid", nullable: false),
                Name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                LoanType = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                Amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                AnnualRate = table.Column<decimal>(type: "numeric(8,4)", precision: 8, scale: 4, nullable: false),
                TermMonths = table.Column<int>(type: "integer", nullable: false),
                IsFavorite = table.Column<bool>(type: "boolean", nullable: false),
                CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_loan_simulations", x => x.Id);
            });

        migrationBuilder.CreateIndex(
            name: "IX_loan_simulations_UserId_CreatedAtUtc",
            table: "loan_simulations",
            columns: new[] { "UserId", "CreatedAtUtc" });

        migrationBuilder.CreateIndex(
            name: "IX_loan_simulations_UserId_IsFavorite",
            table: "loan_simulations",
            columns: new[] { "UserId", "IsFavorite" });
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "loan_simulations");
    }
}
