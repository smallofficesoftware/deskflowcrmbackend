import { Op, Sequelize } from "sequelize";

export function buildSearchQueryTask(searchValue, searchableColumns) {

    if (!searchValue || !searchValue.trim()) {
        return {};
    }

    const words = searchValue.trim().toLowerCase().split(/\s+/);
    const fullSearch = searchValue.trim().toLowerCase();

    // FIXED WHERE CLAUSE
    let searchClause = {
        [Op.and]: words.map((word, index) => ({
            [Op.or]: searchableColumns.map(col =>
                Sequelize.where(
                    Sequelize.fn("LOWER", Sequelize.col(col)),
                    {
                        [Op.like]: index === 0
                            ? `${word}%`
                            : `%${word}%`
                    }
                )
            )
        }))
    };

    // ORDER BY (same as yours)
    const relevanceSearchOrder = [
        ...searchableColumns.map(col => [
            Sequelize.literal(`
                CASE 
                    WHEN LOWER(${col}) = '${fullSearch}' 
                    THEN 100 ELSE 0 
                END
            `),
            "DESC"
        ]),

        ...searchableColumns.map(col => [
            Sequelize.literal(`
                CASE 
                    WHEN LOWER(${col}) LIKE '${fullSearch}%' 
                    THEN 50 ELSE 0 
                END
            `),
            "DESC"
        ]),

        ...searchableColumns.map(col => [
            Sequelize.literal(`
                CASE 
                    WHEN LOWER(${col}) LIKE '%${fullSearch}%' 
                    THEN 10 ELSE 0 
                END
            `),
            "DESC"
        ])
    ];

    return { searchClause, relevanceSearchOrder };
}

export function buildSearchQuery(searchValue, searchableColumns) {
    const words = searchValue.trim().toLowerCase().split(/\s+/);
    const normalizedSearch = searchValue.replace(/\s+/g, "").toLowerCase();
    // WHERE CLAUSE
    let searchClause = {
        [Op.and]: []
    };

    // Build search for each word
    words.forEach(word => {
        const normalizedWord = word.replace(/\s+/g, "");

        const singleWordOR = {
            [Op.or]: searchableColumns.flatMap(col => ([
                // contains
                Sequelize.where(
                    Sequelize.fn("LOWER", Sequelize.col(col)),
                    { [Op.like]: `%${word}%` }
                ),

                // no-space contains
                Sequelize.where(
                    Sequelize.fn("LOWER", Sequelize.fn("REPLACE", Sequelize.col(col), " ", "")),
                    { [Op.like]: `%${normalizedWord}%` }
                ),

                // starts-with
                Sequelize.where(
                    Sequelize.fn("LOWER", Sequelize.col(col)),
                    { [Op.like]: `${word}%` }
                ),

                // typo tolerant (soundex)
                // Sequelize.where(
                //   Sequelize.fn("SOUNDEX", Sequelize.col(col)),
                //   Sequelize.fn("SOUNDEX", word)
                // )
            ]))
        };

        searchClause[Op.and].push(singleWordOR);
    });
    // ORDER BY (RELEVANCE)
    const relevanceSearchOrder = [
        // exact match
        ...searchableColumns.map(col => [
            Sequelize.literal(`CASE WHEN LOWER(${col}) = '${searchValue.toLowerCase()}' THEN 1 ELSE 0 END`),
            "DESC"
        ]),

        // exact no-space match
        ...searchableColumns.map(col => [
            Sequelize.literal(`CASE WHEN LOWER(REPLACE(${col}, ' ', '')) = '${normalizedSearch}' THEN 1 ELSE 0 END`),
            "DESC"
        ]),

        // starts with
        ...searchableColumns.map(col => [
            Sequelize.literal(`CASE WHEN LOWER(${col}) LIKE '${searchValue.toLowerCase()}%' THEN 1 ELSE 0 END`),
            "DESC"
        ]),

        // phonetic
        // ...searchableColumns.map(col => [
        //   Sequelize.literal(`CASE WHEN SOUNDEX(${col}) = SOUNDEX('${searchValue}') THEN 1 ELSE 0 END`),
        //   "DESC"
        // ]),

        // contains
        ...searchableColumns.map(col => [
            Sequelize.literal(`CASE WHEN LOWER(${col}) LIKE '%${searchValue.toLowerCase()}%' THEN 1 ELSE 0 END`),
            "DESC"
        ])
    ];
    return { searchClause, relevanceSearchOrder };
}