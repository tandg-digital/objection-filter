'use strict';

const _ = require('lodash');
require('chai').should();
const testUtils = require('./utils');
const { buildFilter } = require('../src');

describe('eager object notation', function () {

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

      describe('$where on root model', function() {
        it('should filter on the root model', done => {
          buildFilter(Person)
            .build({
              eager: {
                $where: {
                  firstName: 'F01'
                }
              }
            })
            .then(result => {
              result.length.should.equal(1);
              result[0].firstName.should.equal('F01');
              done();
            })
            .catch(done);
        });
      });

      describe('$where on eager models', function() {
        it('should filter using a single condition', done => {
          buildFilter(Person)
            .build({
              eager: {
                movies: {
                  $where: {
                    name: 'M99'
                  }
                }
              }
            })
            .then(result => {
              result.length.should.equal(10);
              _.map(
                _.flatten(
                  _.map(result, 'movies')
                ), 'name'
              ).should.deep.equal(['M99']);
              done();
            })
            .catch(done);
        });

        it('should filter using a boolean condition', done => {
          buildFilter(Person)
            .build({
              eager: {
                movies: {
                  $where: {
                    $or: [
                      { name: 'M99' },
                      { name: 'M98' }
                    ]
                  }
                }
              }
            })
            .then(result => {
              result.length.should.equal(10);
              _.map(
                _.flatten(
                  _.map(result, 'movies')
                ), 'name'
              ).should.deep.equal(['M98', 'M99']);
              done();
            })
            .catch(done);
        });

        it('should filter using a nested boolean condition', done => {
          buildFilter(Person)
            .build({
              eager: {
                movies: {
                  $where: {
                    $or: [
                      { name: 'M99' },
                      {
                        $or: [
                          { name: 'M98' }
                        ]
                      }
                    ]
                  }
                }
              }
            })
            .then(result => {
              result.length.should.equal(10);
              _.map(
                _.flatten(
                  _.map(result, 'movies')
                ), 'name'
              ).should.deep.equal(['M98', 'M99']);
              done();
            })
            .catch(done);
        });

        it('should filter using a nested condition', done => {
          buildFilter(Person)
            .build({
              eager: {
                parent: {
                  movies: {
                    $where: {
                      name: 'M99'
                    }
                  }
                }
              }
            })
            .then(result => {
              result.length.should.equal(10);
              _.map(
                _.flatten(
                  _.filter(_.map(result, 'parent.movies'), _.identity)
                ), 'name'
              ).should.deep.equal(['M99']);
              done();
            })
            .catch(done);
        });

        it('should filter alongside default eagers', done => {
          buildFilter(Person)
            .build({
              eager: {
                movies: {
                  $where: {
                    name: 'M99'
                  }
                },
                pets: true
              }
            })
            .then(result => {
              result.length.should.equal(10);
              _.map(
                _.flatten(
                  _.map(result, 'movies')
                ), 'name'
              ).should.deep.equal(['M99']);
              _.flatten(
                _.map(result, 'pets')
              )
              .length.should.be.greaterThan(0);
              done();
            })
            .catch(done);
        });

        it('should filter using specified $relation alias', done => {
          buildFilter(Person)
            .build({
              eager: {
                favorites: {
                  $relation: 'movies',
                  $where: {
                    name: 'M99'
                  }
                }
              }
            })
            .then(result => {
              result.length.should.equal(10);
              _.map(
                _.flatten(
                  _.map(result, 'favorites')
                ), 'name'
              ).should.deep.equal(['M99']);
              done();
            })
            .catch(done);
        });

        it('should filter using nested $relation aliases', done => {
          buildFilter(Person)
            .build({
              eager: {
                upper: {
                  $relation: 'parent',
                  $where: {
                    firstName: 'F05'
                  },
                  favorites: {
                    $relation: 'movies',
                    $where: {
                      name: 'M49'
                    }
                  }
                }
              }
            })
            .then(result => {
              result.length.should.equal(10);
              _.map(
                _.flatten(
                  _.filter(_.map(result, 'upper.favorites'), _.identity)
                ), 'name'
              ).should.deep.equal(['M49']);
              done();
            })
            .catch(done);
        });
      });

      describe('root model using root fields', function() {
        it('should filter by a single field', async function() {
          const result = await buildFilter(Person)
            .build({
              eager: {
                $where: {
                  firstName: 'F00'
                }
              }
            })
          result.map(item => item.firstName).should.deep.equal([
            'F00'
          ]);
        });

        it('should filter using multiple fields', async function() {
          const result = await buildFilter(Person)
            .build({
              eager: {
                $where: {
                  firstName: 'F00',
                  lastName: 'L09'
                }
              }
            })
          result.map(item => item.firstName).should.deep.equal([
            'F00'
          ]);
          result.map(item => item.lastName).should.deep.equal([
            'L09'
          ]);
        });
      });

      describe('eager models using base fields', function() {
        it('should filter by a single field', async function() {
          const result = await buildFilter(Person)
            .build({
              eager: {
                movies: {
                  $where: {
                    name: 'M99'
                  }
                }
              }
            })
          result.length.should.equal(10);
          _.map(
            _.flatten(
              _.map(result, 'movies')
            ), 'name'
          ).should.deep.equal(['M99']);
        });
      });

      describe('root model using related fields', function() {
        it('should filter by a single field', async function() {
          const result = await buildFilter(Person)
            .build({
              eager: {
                $where: {
                  'movies.name': 'M00'
                }
              }
            });
          result.map(item => item.firstName).should.deep.equal([
            'F09'
          ]);
        });

        it('should filter using multiple fields', async function() {
          const result = await buildFilter(Person)
            .build({
              eager: {
                $where: {
                  'movies.name': 'M00',
                  'pets.name': 'P90'
                }
              }
            });
          result.map(item => item.firstName).should.deep.equal([
            'F09'
          ]);
        });
      });

      describe('eager models using related fields', function() {
        // Some convenient constants
        const baseSet = [
          'M99',
          'M98',
          'M97',
          'M96',
          'M95',
          'M94',
          'M93',
          'M92',
          'M91',
          'M90'
        ];
        const extendedSet = [
          'M99',
          'M98',
          'M97',
          'M96',
          'M95',
          'M94',
          'M93',
          'M92',
          'M91',
          'M90',
          'M89',
          'M88',
          'M87',
          'M86',
          'M85',
          'M84',
          'M83',
          'M82',
          'M81',
          'M80'
        ];

        it('should filter by a single field', async function() {
          const result = await buildFilter(Person)
            .build({
              eager: {
                movies: {
                  $where: {
                    'category.name': 'C00'
                  }
                }
              }
            })
          result.length.should.equal(10);
          _.map(
            _.flatten(
              _.map(result, 'movies')
            ), 'name'
          ).should.deep.equal(baseSet);
        });

        it('should filter by using a logical condition', async function() {
          const result = await buildFilter(Person)
            .build({
              eager: {
                movies: {
                  $where: {
                    $or: [
                      { 'category.name': 'C00' },
                      { 'category.name': 'C01' },
                    ]
                  }
                }
              }
            })
          result.length.should.equal(10);
          _.map(
            _.flatten(
              _.map(result, 'movies')
            ), 'name'
          ).should.deep.equal(extendedSet);
        });

        it('should filter by using a logical condition after property name', async function() {
          const result = await buildFilter(Person)
            .build({
              eager: {
                movies: {
                  $where: {
                    'category.name': {
                      $or: [
                        'C00',
                        'C01'
                      ]
                    }
                  }
                }
              }
            })
          result.length.should.equal(10);
          _.map(
            _.flatten(
              _.map(result, 'movies')
            ), 'name'
          ).should.deep.equal(extendedSet);
        });
      });
    });
  });
});