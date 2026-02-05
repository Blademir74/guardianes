-- Ref: src/routes/data.js requirements
-- Recreating historical_results table to match code expectations
DROP TABLE IF EXISTS historical_results;

CREATE TABLE historical_results (
    id SERIAL PRIMARY KEY,
    municipality_id INTEGER NOT NULL REFERENCES municipalities(id),
    election_type VARCHAR(50),
    election_year INTEGER,
    party VARCHAR(50),
    votes INTEGER,
    percentage DECIMAL(5,2)
);

-- Index for performance
CREATE INDEX idx_historical_results_municipality ON historical_results(municipality_id);
CREATE INDEX idx_historical_results_year ON historical_results(election_year);
