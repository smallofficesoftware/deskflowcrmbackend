import { Op, Sequelize } from "sequelize";

const escapeLike = (text) => text.replace(/[\\%_]/g, "\\$&");

export function buildSearchQueryTask(searchValue, searchableColumns) {

    if (!searchValue || !searchValue.trim()) {
        return {};
    }

    const fullSearch = searchValue.trim().toLowerCase();
    const words = fullSearch.split(/\s+/);

    const lowerCol = (col) => Sequelize.fn("LOWER", Sequelize.col(col));
    // id is numeric, so it stays prefix-only; "12" should not match every id containing 12
    const likePattern = (col, text) =>
        col === "id" ? `${escapeLike(text)}%` : `%${escapeLike(text)}%`;

    // every word must appear in at least one column, anywhere in that column
    const searchClause = {
        [Op.and]: words.map((word) => ({
            [Op.or]: searchableColumns.map((col) =>
                Sequelize.where(lowerCol(col), { [Op.like]: likePattern(col, word) })
            )
        }))
    };

    // user text is only ever passed as a value, so Sequelize escapes it
    const score = (col, comparator, value, points) => [
        Sequelize.fn("IF", Sequelize.where(lowerCol(col), comparator, value), points, 0),
        "DESC"
    ];

    const relevanceSearchOrder = [
        ...searchableColumns.map((col) => score(col, Op.eq, fullSearch, 100)),
        ...searchableColumns.map((col) => score(col, Op.like, `${escapeLike(fullSearch)}%`, 50)),
        ...searchableColumns.map((col) => score(col, Op.like, likePattern(col, fullSearch), 10))
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