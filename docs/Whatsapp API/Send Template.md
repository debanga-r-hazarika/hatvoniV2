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

# Get All Templates

Example JSON Response

```
{
    "data": [
        {
            "name": "hello_world",
            "previous_category": "ACCOUNT_UPDATE",
            "components": [
                {
                    "type": "HEADER",
                    "format": "TEXT",
                    "text": "Hello World"
                },
                {
                    "type": "BODY",
                    "text": "Welcome and congratulations!! This message demonstrates your ability to send a message notification from WhatsApp Business Platform’s Cloud API. Thank you for taking the time to test with us."
                },
                {
                    "type": "FOOTER",
                    "text": "WhatsApp Business API Team"
                }
            ],
            "language": "en_US",
            "status": "APPROVED",
            "category": "MARKETING",
            "id": "1192339204654487"
        },
        {
            "name": "2023_april_promo",
            "components": [
                {
                    "type": "HEADER",
                    "format": "TEXT",
                    "text": "Fall Sale"
                },
                {
                    "type": "BODY",
                    "text": "Hi {{1}}, our Fall Sale is on! Use promo code {{2}} Get an extra 25% off every order above $350!",
                    "example": {
                        "body_text": [
                            [
                                "Mark",
                                "FALL25"
                            ]
                        ]
                    }
                },
                {
                    "type": "FOOTER",
                    "text": "Not interested in any of our sales? Tap Stop Promotions"
                },
                {
                    "type": "BUTTONS",
                    "buttons": [
                        {
                            "type": "QUICK_REPLY",
                            "text": "Stop promotions"
                        }
                    ]
                }
            ],
            "language": "en_US",
            "status": "APPROVED",
            "category": "MARKETING",
            "id": "920070352646140"
        }
    ],
    "paging": {
        "cursors": {
            "before": "MAZDZD",
            "after": "MjQZD"
        }
    }
}
```

# OpenAPI definition

```json
{
  "openapi": "3.0.0",
  "info": {
    "version": "1.0.0",
    "title": "Get all templates"
  },
  "servers": [
    {
      "url": "https://www.fast2sms.com"
    }
  ],
  "paths": {
    "/dev/whatsapp/{version}/{waba_id}/message_templates": {
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
                    "name": {
                      "type": "string"
                    }
                  },
                  "required": [
                    "name"
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
            "in": "path",
            "name": "waba_id",
            "schema": {
              "type": "string"
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

Get Media URL From Media ID (received in webhook)

# Get Media URL From Media ID (received in webhook)

Example JSON Response

```
{
    "messaging_product": "whatsapp",
    "url": "<URL>",
    "mime_type": "<MIME_TYPE>",
    "sha256": "<HASH>",
    "file_size": "<FILE_SIZE>",
    "id": "<MEDIA_ID>"
}
```

# OpenAPI definition

```json
{
  "openapi": "3.0.0",
  "info": {
    "version": "1.0.0",
    "title": "Get Media URL from media id"
  },
  "servers": [
    {
      "url": "https://www.fast2sms.com"
    }
  ],
  "paths": {
    "/dev/whatsapp/{version}/{phone_number_id}/media/{media_id}": {
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
                    "messaging_product": {
                      "type": "string",
                      "default": "whatsapp"
                    },
                    "url": {
                      "type": "string"
                    },
                    "mime_type": {
                      "type": "string"
                    },
                    "sha256": {
                      "type": "string"
                    },
                    "file_size": {
                      "type": "string"
                    },
                    "id": {
                      "type": "string"
                    }
                  },
                  "required": [
                    "messaging_product",
                    "url",
                    "mime_type",
                    "sha256",
                    "file_size",
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
            "name": "phone_number_id",
            "schema": {
              "type": "string"
            },
            "required": true
          },
          {
            "in": "path",
            "name": "media_id",
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
            "description": "Provide \"YOUR_API_KEY\".",
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


Send Template Message (Simple)

# Send Template Message (Simple)

This is a simple API for sending WhatsApp template messages using Fast2SMS format. If you need to send messages directly, consider using the META Format API (Advanced).

<Anchor label="Get Phone Number ID & Message ID using this API" target="_blank" href="https://docs.fast2sms.com/reference/get-waba-template-details">Get Phone Number ID & Message ID using this API</Anchor>

<br />

# OpenAPI definition

```json
{
  "openapi": "3.0.3",
  "info": {
    "title": "Fast2SMS WhatsApp Message API",
    "description": "A single GET endpoint to send various types of WhatsApp messages (Text, Media, Variables) by changing the query parameters.",
    "version": "1.0.0"
  },
  "servers": [
    {
      "url": "https://www.fast2sms.com"
    }
  ],
  "paths": {
    "/dev/whatsapp": {
      "get": {
        "tags": [
          "Sending Messages"
        ],
        "summary": "Send WhatsApp Message",
        "description": "Send templates with text, variables, or media depending on the provided parameters.",
        "operationId": "sendWhatsappMessage",
        "parameters": [
          {
            "name": "authorization",
            "in": "query",
            "description": "Your API Key.",
            "required": true,
            "schema": {
              "type": "string",
              "default": "YOUR_API_KEY"
            }
          },
          {
            "name": "message_id",
            "in": "query",
            "description": "Unique Fast2SMS Message ID of the template. Check WhatsApp Manager inside Fast2SMS Panel or use \"Get WABA & Template Details\" API\n",
            "required": true,
            "schema": {
              "type": "integer",
              "example": 9
            }
          },
          {
            "name": "phone_number_id",
            "in": "query",
            "description": "WABA Phone Number ID.",
            "required": true,
            "schema": {
              "type": "string",
              "example": "579519398574288"
            }
          },
          {
            "name": "numbers",
            "in": "query",
            "description": "Destination mobile number.",
            "required": true,
            "schema": {
              "type": "string",
              "example": "9999999999"
            }
          },
          {
            "name": "variables_values",
            "in": "query",
            "description": "Required if the template has variables ({{1}}, {{2}}). Join multiple values with a pipe `|`.",
            "required": false,
            "schema": {
              "type": "string",
              "example": "Var1|Var2|Var3"
            }
          },
          {
            "name": "media_url",
            "in": "query",
            "description": "Required if the template has a Header Media (Image/Video/PDF).",
            "required": false,
            "schema": {
              "type": "string",
              "format": "uri",
              "example": "https://example.com/image.png"
            }
          },
          {
            "in": "query",
            "name": "document_filename",
            "schema": {
              "type": "string"
            },
            "description": "(optional) To give PDF custom document title"
          }
        ],
        "responses": {
          "200": {
            "description": "Message Sent Successfully",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "status": {
                      "type": "boolean",
                      "example": true
                    },
                    "message": {
                      "type": "string",
                      "example": "Message sent successfully"
                    },
                    "request_id": {
                      "type": "string",
                      "example": "6a3b2c1d"
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

Get Template By ID

# Get Template By ID

Example JSON Response

```
{
    "name": "2023_april_promo",
    "components": [
        {
            "type": "HEADER",
            "format": "TEXT",
            "text": "Fall Sale"
        },
        {
            "type": "BODY",
            "text": "Hi {{1}}, our Fall Sale is on! Use promo code {{2}} Get an extra 25% off every order above $350!",
            "example": {
                "body_text": [
                    [
                        "Mark",
                        "FALL25"
                    ]
                ]
            }
        },
        {
            "type": "FOOTER",
            "text": "Not interested in any of our sales? Tap Stop Promotions"
        },
        {
            "type": "BUTTONS",
            "buttons": [
                {
                    "type": "QUICK_REPLY",
                    "text": "Stop promotions"
                }
            ]
        }
    ],
    "language": "en_US",
    "status": "APPROVED",
    "category": "MARKETING",
    "id": "920070352646140"
}
```

# OpenAPI definition

```json
{
  "openapi": "3.0.0",
  "info": {
    "version": "1.0.0",
    "title": "Get Template by id"
  },
  "servers": [
    {
      "url": "https://www.fast2sms.com"
    }
  ],
  "paths": {
    "/dev/whatsapp/{version}/{template_id}": {
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
                    "id": {
                      "type": "string"
                    },
                    "category": {
                      "type": "string",
                      "default": "MARKETING"
                    },
                    "status": {
                      "type": "string"
                    },
                    "language": {
                      "type": "string"
                    },
                    "name": {
                      "type": "string"
                    },
                    "components": {
                      "type": "array",
                      "items": {
                        "properties": {
                          "type": {
                            "type": "string",
                            "default": "HEADER"
                          },
                          "format": {
                            "type": "string",
                            "default": "TEXT"
                          },
                          "text": {
                            "type": "string"
                          }
                        },
                        "type": "object",
                        "required": [
                          "type",
                          "format",
                          "text"
                        ]
                      }
                    }
                  },
                  "required": [
                    "id",
                    "status",
                    "category",
                    "language",
                    "name"
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
            "in": "path",
            "name": "template_id",
            "schema": {
              "type": "string"
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

