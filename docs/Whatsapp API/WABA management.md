Get WABA & Template Details

# Get WABA & Template Details

Use this API to get WABA ID, Phone Number ID, Message ID, Meta Template ID

Example JSON Response for Number

```
{
    "success": true,
    "data": [
        {
            "waba_id": 99999999999xxxx,
            "phone_number_id": 576xxxxxx,
            "number": "15xxxxxxxxx",
            "verified_name": "Name",
            "name_status": "Approved",
            "quality_rating": "GREEN",
            "messaging_limit": "TIER_100K",
            "platform_type": "CLOUD_API",
            "connection_status": "CONNECTED"
        }
    ]
}
```

Example JSON Response for Template

```
{
    "success": true,
    "data": [
        {
            "waba_id": 99999999999xxxx,
            "phone_number_id": 576xxxxxx,
            "number": "15xxxxxxxxx",
            "verified_name": "Name",
            "name_status": "Approved",
            "quality_rating": "GREEN",
            "messaging_limit": "TIER_100K",
            "platform_type": "CLOUD_API",
            "connection_status": "CONNECTED"
            "templates": [
                {
          					"message_id": 8340,
                    "template_id": "20xxxxxxxxxxxxx",
                    "template_name": "template_name",
                    "category": "MARKETING",
                    "status": "Approved",
                    "language": "en",
                    "var_count": 1,
                    "components": [
                        {
                            "type": "BODY",
                            "text": "Hi {{1}}, This is a test message",
                            "example": {
                                "body_text": [
                                    [
                                        "John Doe"
                                    ]
                                ]
                            }
                        }
                    ]
                }
            ]
        }
    ]
}
```

<br />

# OpenAPI definition

```json
{
  "openapi": "3.0.0",
  "info": {
    "version": "1.0.0",
    "title": "WhatsApp API"
  },
  "servers": [
    {
      "url": "https://www.fast2sms.com"
    }
  ],
  "paths": {
    "/dev/dlt_manager/whatsapp": {
      "get": {
        "summary": "New Endpoint",
        "description": "This is your first endpoint! Edit this page to start documenting your API.",
        "operationId": "get_new-endpoint",
        "responses": {
          "200": {
            "description": "",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": {
                      "type": "string",
                      "default": "true"
                    },
                    "data": {
                      "type": "array",
                      "items": {
                        "properties": {
                          "waba_id": {
                            "type": "string"
                          },
                          "phone_number_id": {
                            "type": "string"
                          },
                          "number": {
                            "type": "string"
                          },
                          "verified_name": {
                            "type": "string"
                          },
                          "name_status": {
                            "type": "string"
                          },
                          "quality_rating": {
                            "type": "string"
                          },
                          "messaging_limit": {
                            "type": "string"
                          },
                          "platform_type": {
                            "type": "string"
                          },
                          "connection_status": {
                            "type": "string"
                          }
                        },
                        "type": "object",
                        "required": [
                          "waba_id",
                          "phone_number_id",
                          "number",
                          "verified_name",
                          "name_status",
                          "quality_rating",
                          "messaging_limit",
                          "platform_type",
                          "connection_status"
                        ]
                      }
                    }
                  },
                  "required": [
                    "success",
                    "data"
                  ]
                }
              }
            }
          }
        },
        "parameters": [
          {
            "in": "query",
            "name": "authorization",
            "schema": {
              "type": "string",
              "default": "YOUR_API_KEY"
            },
            "required": true,
            "description": "Provide \"YOUR_API_KEY\"."
          },
          {
            "in": "query",
            "name": "type",
            "schema": {
              "type": "string",
              "enum": [
                "number",
                "template"
              ],
              "default": "number"
            },
            "required": true
          }
        ]
      }
    }
  },
  "x-readme": {
    "explorer-enabled": true,
    "proxy-enabled": true
  }
}
```


# Get Buisness Profile

Example JSON Response for Template

```
{
    "data": [
        {
            "about": "Hey there! I am using WhatsApp.",
            "profile_picture_url": "https://pps.whatsapp.net/v/t61.24694-24/513069239_1836259583917664_7191080178211830071_n.jpg?ccb=11-4&oh=01_Q5Aa3AGJ_pBw4hWnhIjiLQWe6PjVmDkAo4_J2T0cQgBoyov8vQ&oe=692B9237&_nc_sid=5e03e0&_nc_cat=100",
            "vertical": "PROF_SERVICES",
            "messaging_product": "whatsapp"
        }
    ]
}
```

<br />

# OpenAPI definition

```json
{
  "openapi": "3.0.0",
  "info": {
    "version": "1.0.0",
    "title": "WhatsApp API"
  },
  "servers": [
    {
      "url": "https://www.fast2sms.com"
    }
  ],
  "paths": {
    "/dev/whatsapp/{version}/{phone_number_id}/whatsapp_business_profile": {
      "get": {
        "description": "",
        "operationId": "get_devwhatsapp{version}{phone_number_id}}whatsapp_business_profile",
        "responses": {
          "200": {
            "description": "",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "data": {
                      "type": "array",
                      "items": {
                        "properties": {
                          "id": {
                            "type": "string"
                          },
                          "is_official_business_account": {
                            "type": "string"
                          },
                          "display_phone_number": {
                            "type": "string"
                          },
                          "verified_name": {
                            "type": "string"
                          }
                        },
                        "type": "object",
                        "required": [
                          "id",
                          "is_official_business_account",
                          "display_phone_number",
                          "verified_name"
                        ]
                      }
                    },
                    "paging": {
                      "type": "array",
                      "items": {
                        "properties": {
                          "cursors": {
                            "type": "array",
                            "items": {
                              "properties": {
                                "before": {
                                  "type": "string"
                                },
                                "after": {
                                  "type": "string"
                                }
                              },
                              "type": "object",
                              "required": [
                                "before",
                                "after"
                              ]
                            }
                          }
                        },
                        "type": "object",
                        "required": [
                          "cursors"
                        ]
                      }
                    }
                  },
                  "required": [
                    "data",
                    "paging"
                  ]
                }
              }
            }
          }
        },
        "parameters": [
          {
            "in": "path",
            "name": "version",
            "schema": {
              "type": "string",
              "default": "v24.0"
            },
            "required": true
          },
          {
            "in": "path",
            "name": "phone_number_id",
            "schema": {
              "type": "string"
            },
            "required": true
          },
          {
            "in": "query",
            "name": "authorization",
            "schema": {
              "type": "string",
              "default": "YOUR_API_KEY"
            },
            "required": true,
            "description": "Provide \"YOUR_API_KEY\"."
          },
          {
            "in": "query",
            "name": "fields",
            "schema": {
              "type": "string",
              "default": "about,address,description,email,profile_picture_url,websites,vertical"
            },
            "required": true
          }
        ]
      }
    }
  },
  "x-readme": {
    "explorer-enabled": true,
    "proxy-enabled": true
  }
}
```

Get Display Name Status

# Get Display Name Status

Example JSON Response

```
{
    "name_status": "APPROVED",
    "id": "57xxxxxxxxxx"
}
```

<br />

# OpenAPI definition

```json
{
  "openapi": "3.0.0",
  "info": {
    "version": "1.0.0",
    "title": "Get Display Name Status"
  },
  "servers": [
    {
      "url": "https://www.fast2sms.com"
    }
  ],
  "paths": {
    "/dev/whatsapp/{version}/{phone-number_id}": {
      "get": {
        "summary": "New Endpoint",
        "description": "This is your first endpoint! Edit this page to start documenting your API.",
        "operationId": "get_new-endpoint",
        "responses": {
          "200": {
            "description": "",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "name_status": {
                      "type": "string"
                    },
                    "id": {
                      "type": "string"
                    }
                  },
                  "required": [
                    "name_status",
                    "id"
                  ]
                }
              }
            }
          }
        },
        "parameters": [
          {
            "in": "path",
            "name": "version",
            "schema": {
              "type": "string",
              "default": "v24.0"
            },
            "required": true
          },
          {
            "in": "path",
            "name": "phone-number_id",
            "schema": {
              "type": "string"
            },
            "required": true
          },
          {
            "in": "query",
            "name": "authorization",
            "schema": {
              "type": "string",
              "default": "YOUR_API_KEY"
            },
            "required": true,
            "description": "Provide \"YOUR_API_KEY\"."
          },
          {
            "in": "query",
            "name": "fields",
            "schema": {
              "type": "string",
              "default": "name_status"
            },
            "required": true
          }
        ]
      }
    }
  },
  "x-readme": {
    "explorer-enabled": true,
    "proxy-enabled": true
  }
}
```

Get WABA Health Status

# Get WABA Health Status

Example JSON Response

```
{
    "health_status": {
        "can_send_message": "AVAILABLE",
        "entities": [
            {
                "entity_type": "WABA",
                "id": "xxxxxxxxxxxxxx",
                "can_send_message": "AVAILABLE"
            }
        ]
    },
    "id": "61xxxxxxxxxxxx"
}
```

<br />

# OpenAPI definition

```json
{
  "openapi": "3.0.0",
  "info": {
    "version": "1.0.0",
    "title": "Get WABA Health Status"
  },
  "servers": [
    {
      "url": "https://www.fast2sms.com"
    }
  ],
  "paths": {
    "/dev/whatsapp/{version}/{waba_id}": {
      "get": {
        "summary": "New Endpoint",
        "description": "This is your first endpoint! Edit this page to start documenting your API.",
        "operationId": "get_new-endpoint",
        "responses": {
          "200": {
            "description": "",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "health_status": {
                      "type": "array",
                      "items": {
                        "properties": {
                          "can_send_message": {
                            "type": "string"
                          },
                          "entities": {
                            "type": "array",
                            "items": {
                              "properties": {
                                "entity_type": {
                                  "type": "string"
                                },
                                "id": {
                                  "type": "string"
                                },
                                "can_send_message": {
                                  "type": "string"
                                }
                              },
                              "type": "object",
                              "required": [
                                "entity_type",
                                "id",
                                "can_send_message"
                              ]
                            }
                          }
                        },
                        "type": "object",
                        "required": [
                          "can_send_message",
                          "entities"
                        ]
                      }
                    },
                    "id": {
                      "type": "string"
                    }
                  },
                  "required": [
                    "health_status",
                    "id"
                  ]
                }
              }
            }
          }
        },
        "parameters": [
          {
            "in": "path",
            "name": "version",
            "schema": {
              "type": "string",
              "default": "v24.0"
            },
            "required": true
          },
          {
            "in": "path",
            "name": "waba_id",
            "schema": {
              "type": "string"
            },
            "required": true
          },
          {
            "in": "query",
            "name": "authorization",
            "schema": {
              "type": "string",
              "default": "YOUR_API_KEY"
            },
            "required": true,
            "description": "Provide \"YOUR_API_KEY\"."
          },
          {
            "in": "query",
            "name": "fields",
            "schema": {
              "type": "string",
              "default": "health_status"
            },
            "required": true
          }
        ]
      }
    }
  },
  "x-readme": {
    "explorer-enabled": true,
    "proxy-enabled": true
  }
}
```
Get Phone Numbers

# Get Phone Numbers

Example JSON Response

```
{
    "data": [
        {
            "verified_name": "Name",
            "code_verification_status": "VERIFIED",
            "display_phone_number": "155xxxxxxxx",
            "quality_rating": "GREEN",
            "platform_type": "CLOUD_API",
            "throughput": {
                "level": "STANDARD"
            },
            "last_onboarded_time": "2025-10-14T10:13:11+0000",
            "id": "579xxxxxxxxxxxx"
        }
    ],
    "paging": {
        "cursors": {
            "before": "QVFIU2JpUGRxd3RXaDQyaHRudjBXaUpjWnZACM1ZARYlpYOVA2VWV0c01uYW5XbzdqM281ZAG9ueHlVQS1OcndXek0tRm01YnlYRTlwaDRMQWNqdG9ILUtLUVBn",
            "after": "QVFIU2JpUGRxd3RXaDQyaHRudjBXaUpjWnZACM1ZARYlpYOVA2VWV0c01uYW5XbzdqM281ZAG9ueHlVQS1OcndXek0tRm01YnlYRTlwaDRMQWNqdG9ILUtLUVBn"
        }
    }
}
```

<br />

# OpenAPI definition

```json
{
  "openapi": "3.0.0",
  "info": {
    "version": "1.0.0",
    "title": "WhatsApp API"
  },
  "servers": [
    {
      "url": "https://www.fast2sms.com"
    }
  ],
  "paths": {
    "/dev/whatsapp/{version}/{waba_id}/phone_numbers": {
      "get": {
        "description": "",
        "operationId": "get_devwhatsapp{version}{waba_id}phone_numbers",
        "responses": {
          "200": {
            "description": "",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "data": {
                      "type": "array",
                      "items": {
                        "properties": {
                          "verified_name": {
                            "type": "string"
                          },
                          "code_verification_status": {
                            "type": "string"
                          },
                          "display_phone_number": {
                            "type": "string"
                          },
                          "quality_rating": {
                            "type": "string"
                          },
                          "platform_type": {
                            "type": "string"
                          },
                          "throughput": {
                            "type": "array",
                            "items": {
                              "properties": {
                                "level": {
                                  "type": "string"
                                }
                              },
                              "type": "object",
                              "required": [
                                "level"
                              ]
                            }
                          },
                          "last_onboarded_time": {
                            "type": "string",
                            "format": "date-time"
                          },
                          "webhook_configuration": {
                            "type": "array",
                            "items": {
                              "properties": {
                                "application": {
                                  "type": "string"
                                }
                              },
                              "type": "object",
                              "required": [
                                "application"
                              ]
                            }
                          },
                          "id": {
                            "type": "string"
                          }
                        },
                        "type": "object",
                        "required": [
                          "verified_name",
                          "code_verification_status",
                          "display_phone_number",
                          "quality_rating",
                          "platform_type",
                          "throughput",
                          "last_onboarded_time",
                          "webhook_configuration",
                          "id"
                        ]
                      }
                    },
                    "paging": {
                      "type": "array",
                      "items": {
                        "properties": {
                          "cursors": {
                            "type": "array",
                            "items": {
                              "properties": {
                                "before": {
                                  "type": "string"
                                },
                                "after": {
                                  "type": "string"
                                }
                              },
                              "type": "object",
                              "required": [
                                "before",
                                "after"
                              ]
                            }
                          }
                        },
                        "type": "object",
                        "required": [
                          "cursors"
                        ]
                      }
                    }
                  },
                  "required": [
                    "data",
                    "paging"
                  ]
                }
              }
            }
          }
        },
        "parameters": [
          {
            "in": "path",
            "name": "version",
            "schema": {
              "type": "string",
              "default": "v24.0"
            },
            "required": true
          },
          {
            "in": "path",
            "name": "waba_id",
            "schema": {
              "type": "string"
            },
            "required": true,
            "description": "Provide \"YOUR_WABA_ID\"."
          },
          {
            "in": "query",
            "name": "authorization",
            "schema": {
              "type": "string",
              "default": "YOUR_API_KEY"
            },
            "required": true,
            "description": "Provide \"YOUR_API_KEY\"."
          }
        ]
      }
    }
  },
  "x-readme": {
    "explorer-enabled": true,
    "proxy-enabled": true
  }
}
```

Get Single Phone Number Details

# Get Single Phone Number Details

Example JSON Response

```
{
    "status": "CONNECTED",
    "is_official_business_account": true,
    "id": "579xxxxxxxxxxx",
    "name_status": "APPROVED",
    "code_verification_status": "VERIFIED",
    "display_phone_number": "15xxxxxxxxxxx",
    "platform_type": "CLOUD_API",
    "messaging_limit_tier": "TIER_100K",
    "throughput": {
        "level": "STANDARD"
    }
}
```

<br />

# OpenAPI definition

```json
{
  "openapi": "3.0.0",
  "info": {
    "version": "1.0.0",
    "title": "WhatsApp API"
  },
  "servers": [
    {
      "url": "https://www.fast2sms.com"
    }
  ],
  "paths": {
    "/dev/whatsapp/{version}/{phone_number_id}": {
      "get": {
        "description": "",
        "operationId": "get_devwhatsapp{version}{phone_number_id}",
        "responses": {
          "200": {
            "description": "",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "status": {
                      "type": "string"
                    },
                    "is_official_business_account": {
                      "type": "string"
                    },
                    "name_status": {
                      "type": "string"
                    },
                    "code_verification_status": {
                      "type": "string"
                    },
                    "display_phone_number": {
                      "type": "string"
                    },
                    "platform_type": {
                      "type": "string"
                    },
                    "id": {
                      "type": "string"
                    },
                    "messaging_limit_tier": {
                      "type": "string"
                    },
                    "throughput": {
                      "type": "array",
                      "items": {
                        "properties": {
                          "level": {
                            "type": "string"
                          }
                        },
                        "type": "object",
                        "required": [
                          "level"
                        ]
                      }
                    }
                  },
                  "required": [
                    "status",
                    "is_official_business_account",
                    "name_status",
                    "code_verification_status",
                    "display_phone_number",
                    "platform_type",
                    "id",
                    "messaging_limit_tier",
                    "throughput"
                  ]
                }
              }
            }
          }
        },
        "parameters": [
          {
            "in": "path",
            "name": "version",
            "schema": {
              "type": "string",
              "default": "v24.0"
            },
            "required": true
          },
          {
            "in": "path",
            "name": "phone_number_id",
            "schema": {
              "type": "string"
            },
            "required": true
          },
          {
            "in": "query",
            "name": "authorization",
            "schema": {
              "type": "string",
              "default": "YOUR_API_KEY"
            },
            "required": true,
            "description": "Provide \"YOUR_API_KEY\"."
          },
          {
            "in": "query",
            "name": "fields",
            "schema": {
              "type": "string",
              "default": "status,is_official_business_account,id,name_status,code_verification_status,display_phone_number,platform_type,messaging_limit_tier,throughput"
            },
            "required": true
          }
        ]
      }
    }
  },
  "x-readme": {
    "explorer-enabled": true,
    "proxy-enabled": true
  }
}
```