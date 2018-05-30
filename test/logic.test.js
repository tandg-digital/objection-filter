'use strict';

const _ = require('lodash');
require('chai').should();
const testUtils = require('./utils');
const { buildFilter } = require('../src');

describe('logical expression filters', function () {

  _.each(testUtils.testDatabaseConfigs, function (knexConfig) {

    describe(knexConfig.client, function() {
      var session, knex, Person, Animal, Movie;

      before(function () {
        session = testUtils.initialize(knexConfig);
        knex = session.knex;
        Person = session.models.Person;
        Animal = session.models.Animal;
        Movie = session.models.Movie;
      });

      before(function () {
        return testUtils.dropDb(session);
      });

      before(function () {
        return testUtils.createDb(session);
      });

      before(function () {
        return testUtils.insertData(session, {persons: 10, pets: 10, movies: 10});
      });

      describe('require using logical expressions', function() {
        it('should filter based on stuff', done => {
          buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                '$or': [
                  { 'movies.name': 'M09' },
                  { 'movies.name': 'M08' }
                ]
              }
            })
            .then(result => {
              console.log('result', result);
              result.length.should.equal(1);
              const person = result[0];
              person.firstName.should.equal('F09');
              done();
            })
            .catch(done);
        })
      });
    });
  });
});